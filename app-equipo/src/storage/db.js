// Todo lo relacionado a guardar canciones y listas de misa en el dispositivo
// (IndexedDB). Usamos la librería "idb" porque la API nativa de IndexedDB es
// basada en eventos y muy verbosa; idb es solo un wrapper con Promises, mismo
// motor. Esto anda 100% sin conexión, siempre.
//
// Tanto las canciones como las listas de misa quedan "etiquetadas" con un
// espacio (parroquia, ver storage/constants.js): cada pantalla que llama a
// estas funciones tiene que pasar explícitamente para qué espacio está
// trabajando. Este archivo no sabe cuál es "el espacio actual" — eso lo
// decide storage/settings.js — así evitamos que ambos archivos se importen
// entre sí (un ciclo que rompe en tiempo de ejecución).
import { openDB } from 'idb';
import { CATEGORIES, DEFAULT_SPACE_KEY } from './constants.js';

export { CATEGORIES };

const DB_NAME = 'cancionero-iglesia-db';
const DB_VERSION = 3;
const SONGS_STORE = 'songs';
const MISAS_STORE = 'misas';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        let songsStore;
        if (oldVersion < 1) {
          songsStore = db.createObjectStore(SONGS_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          songsStore.createIndex('title', 'title');
          // multiEntry: cada categoría de song.categories genera su propia
          // entrada en el índice, así una canción con 2 categorías aparece al
          // buscar por cualquiera de las dos.
          songsStore.createIndex('categories', 'categories', { multiEntry: true });

          db.createObjectStore(MISAS_STORE, { keyPath: 'fecha' });
        } else {
          songsStore = transaction.objectStore(SONGS_STORE);
        }

        if (oldVersion < 2) {
          // Cada canción necesita un identificador estable (uuid) que sea
          // el MISMO en todos los dispositivos del equipo, para poder
          // sincronizarla — el "id" local es autoincremental y distinto en
          // cada tablet/celular, no sirve para eso. Las canciones que ya
          // existían antes de esta versión no tienen uuid: se lo generamos
          // acá, una sola vez.
          songsStore.createIndex('uuid', 'uuid', { unique: true });
          let cursor = await songsStore.openCursor();
          while (cursor) {
            if (!cursor.value.uuid) {
              await cursor.update({ ...cursor.value, uuid: crypto.randomUUID() });
            }
            cursor = await cursor.continue();
          }
        }

        if (oldVersion < 3) {
          // Cada parroquia (espacio) tiene su propio cancionero y su propia
          // lista de misa. Las canciones que ya existían quedan asignadas a
          // la primera parroquia de la lista (se pueden recategorizar a
          // mano después si hace falta). En "misas" además cambia la clave:
          // antes era solo la fecha (una lista por día, compartida); ahora
          // tiene que ser "espacio + fecha", porque dos parroquias pueden
          // tener misa el mismo día con listas distintas. IndexedDB no deja
          // cambiar el keyPath de un store que ya existe, así que hay que
          // borrarlo y crearlo de nuevo, copiando los datos viejos.
          songsStore.createIndex('space', 'space');
          let songCursor = await songsStore.openCursor();
          while (songCursor) {
            if (!songCursor.value.space) {
              await songCursor.update({ ...songCursor.value, space: DEFAULT_SPACE_KEY });
            }
            songCursor = await songCursor.continue();
          }

          const misasStoreOld = transaction.objectStore(MISAS_STORE);
          const oldMisas = await misasStoreOld.getAll();
          db.deleteObjectStore(MISAS_STORE);
          const misasStoreNew = db.createObjectStore(MISAS_STORE, { keyPath: 'id' });
          misasStoreNew.createIndex('space', 'space');
          for (const misa of oldMisas) {
            const space = misa.space || DEFAULT_SPACE_KEY;
            await misasStoreNew.put({
              id: `${space}|${misa.fecha}`,
              space,
              fecha: misa.fecha,
              items: misa.items,
              updatedAt: misa.updatedAt,
            });
          }
        }
      },
      // Si esta misma app está abierta en otra pestaña (algo muy común: se
      // deja la tablet con una pestaña vieja abierta y se abre otra nueva),
      // esa pestaña vieja mantiene la base de datos abierta en la versión
      // anterior y bloquea para siempre la actualización acá — sin ningún
      // error visible, la pantalla queda vacía. `blocking` hace que la
      // pestaña vieja cierre sola su conexión apenas otra pestaña necesita
      // actualizar, así esta se puede abrir sin que haga falta cerrar nada
      // a mano.
      blocking() {
        dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// --- Canciones ---

// Guarda una canción nueva. `chordpro` siempre queda en la tonalidad
// original: la transposición es solo un efecto visual del visor, nunca se
// persiste. `categories` es un array de 1 o más strings de CATEGORIES (o de
// una carpeta agregada, ver storage/settings.js). `space` es de qué
// parroquia es (ver storage/constants.js) — cada espacio tiene su propio
// cancionero, separado del de las demás.
export async function saveSong({ title, artist, categories, chordpro, space, shared = false, tags = [] }) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = await db.add(SONGS_STORE, {
    uuid: crypto.randomUUID(),
    space,
    title: title.trim(),
    artist: artist.trim(),
    categories: categories && categories.length ? categories : [],
    chordpro,
    shared,
    tags: tags && tags.length ? tags : [],
    createdAt: now,
    updatedAt: now,
  });
  return getSong(id);
}

export async function updateSong(id, { title, artist, categories, chordpro, shared, tags }) {
  const db = await getDb();
  const existing = await db.get(SONGS_STORE, id);
  if (!existing) throw new Error(`No existe la canción con id ${id}`);
  const updated = {
    ...existing,
    title: title.trim(),
    artist: artist.trim(),
    categories: categories && categories.length ? categories : [],
    chordpro,
    shared: shared ?? existing.shared ?? false,
    tags: tags && tags.length ? tags : [],
    updatedAt: new Date().toISOString(),
  };
  await db.put(SONGS_STORE, updated);
  return updated;
}

// Devuelve la canción tal cual estaba antes de borrarla (o undefined si ya
// no existía), para que quien la borró pueda avisarle a Supabase que
// desapareció (ver storage/sync.js) — sin esto no habría forma de saber qué
// uuid propagar, porque una vez borrada ya no se puede volver a leer.
export async function deleteSong(id) {
  const db = await getDb();
  const existing = await db.get(SONGS_STORE, id);
  await db.delete(SONGS_STORE, id);
  return existing;
}

export async function getSong(id) {
  const db = await getDb();
  return db.get(SONGS_STORE, id);
}

export async function getSongByUuid(uuid) {
  const db = await getDb();
  return db.getFromIndex(SONGS_STORE, 'uuid', uuid);
}

export async function deleteSongByUuid(uuid) {
  const db = await getDb();
  const existing = await db.getFromIndex(SONGS_STORE, 'uuid', uuid);
  if (existing) await db.delete(SONGS_STORE, existing.id);
}

// Escribe (crea o actualiza) una canción a partir de una fila que vino de
// Supabase durante una sincronización — a diferencia de saveSong/updateSong,
// acá el uuid, el espacio y las fechas ya vienen puestos por quien la
// guardó originalmente, no se generan de nuevo.
export async function applyRemoteSong(remote) {
  const db = await getDb();
  const existing = await db.getFromIndex(SONGS_STORE, 'uuid', remote.uuid);
  const record = {
    id: existing ? existing.id : undefined,
    uuid: remote.uuid,
    space: remote.space,
    title: remote.title,
    artist: remote.artist || '',
    categories: remote.categories || [],
    chordpro: remote.chordpro,
    shared: remote.shared || false,
    tags: remote.tags || [],
    createdAt: existing ? existing.createdAt : remote.updated_at,
    updatedAt: remote.updated_at,
  };
  if (existing) {
    await db.put(SONGS_STORE, record);
  } else {
    delete record.id; // autoincrement: que lo asigne IndexedDB
    await db.add(SONGS_STORE, record);
  }
}

export async function getAllSongs(space) {
  const db = await getDb();
  const songs = await db.getAllFromIndex(SONGS_STORE, 'space', space);
  return songs.sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

// Búsqueda simple por nombre, artista o tiempo/tema litúrgico (ej. buscar
// "pascua" encuentra las canciones etiquetadas "Pascua" aunque la palabra
// no esté en el título): alcanza y sobra para un cancionero de parroquia
// (decenas/cientos de canciones), no hace falta un índice de texto.
export async function searchSongs(query, space) {
  const songs = await getAllSongs(space);
  const needle = query.trim().toLowerCase();
  if (!needle) return songs;
  return songs.filter(
    (song) =>
      song.title.toLowerCase().includes(needle) ||
      song.artist.toLowerCase().includes(needle) ||
      (song.tags || []).some((tag) => tag.toLowerCase().includes(needle))
  );
}

export async function getSongsByCategory(category, space) {
  const db = await getDb();
  const songs = await db.getAllFromIndex(SONGS_STORE, 'categories', category);
  return songs
    .filter((song) => song.space === space)
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

// --- Listas de misa ---
// Cada lista queda guardada en IndexedDB con clave = "espacio|fecha" (dos
// parroquias pueden tener listas distintas el mismo día). `items` es un
// objeto { [categoria]: songId | null } — una sola canción por categoría, o
// vacío si ese día no aplica (ej. no siempre hay "Entrada de la Palabra").

export async function saveMisa(space, fecha, items) {
  const db = await getDb();
  const misa = { id: `${space}|${fecha}`, space, fecha, items, updatedAt: new Date().toISOString() };
  await db.put(MISAS_STORE, misa);
  return misa;
}

export async function getMisa(space, fecha) {
  const db = await getDb();
  return db.get(MISAS_STORE, `${space}|${fecha}`);
}

export async function getAllMisas(space) {
  const db = await getDb();
  const misas = await db.getAllFromIndex(MISAS_STORE, 'space', space);
  return misas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}
