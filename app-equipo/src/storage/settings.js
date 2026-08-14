// Configuración simple que el equipo puede cambiar desde la app: carpetas
// (categorías) extra además de las 12 litúrgicas fijas, el título que se
// muestra arriba del todo en la biblioteca, y en qué "espacio" (parroquia)
// se está trabajando ahora mismo. Se guarda en localStorage (no hace falta
// IndexedDB para esto: son valores chiquitos, no el cancionero entero), así
// que también funciona 100% sin conexión.
import { CATEGORIES, LITURGICAL_TAGS } from './constants.js';

const CUSTOM_CATEGORIES_KEY = 'cancionero-iglesia:custom-categories';
const CATEGORY_ORDER_KEY = 'cancionero-iglesia:category-order';
const DEVICE_GROUP_KEY = 'cancionero-iglesia:device-group';
const CUSTOM_TAGS_KEY = 'cancionero-iglesia:custom-tags';
const HEADER_TITLE_KEY = 'cancionero-iglesia:header-title';
const CURRENT_SPACE_KEY = 'cancionero-iglesia:current-space';
const SPACES_KEY = 'cancionero-iglesia:spaces';
// Ojo: esta misma clave está repetida "a mano" en index.html, en un script
// que corre antes de que este archivo exista (para elegir el tema sin que
// se vea un parpadeo al cargar la página) — si la cambiás acá, cambiala ahí también.
const THEME_KEY = 'cancionero-iglesia:theme';

export const DEFAULT_HEADER_TITLE = 'Cancionero';

// Con qué arranca la lista de parroquias/capillas la primera vez que se
// abre la app (después, todo lo que se agregue/edite/borre se guarda en
// localStorage y esto ya no se vuelve a usar).
const SEED_SPACES = [
  { key: 'merced', label: 'Nuestra Señora de la Merced', locality: 'Ushuaia', province: 'Tierra del Fuego' },
  { key: 'maria-auxiliadora', label: 'María Auxiliadora', locality: 'Ushuaia', province: 'Tierra del Fuego' },
  { key: 'general', label: 'General (misas conjuntas)', locality: 'Ushuaia', province: 'Tierra del Fuego' },
];

// null = "seguir el tema del sistema operativo/navegador", no una elección
// explícita. Solo 'light' o 'dark' cuenta como elegido a mano.
export function getStoredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

export function setStoredTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    localStorage.setItem(THEME_KEY, theme);
  } else {
    localStorage.removeItem(THEME_KEY);
  }
}

export function getEffectiveTheme() {
  return getStoredTheme() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

// Parroquias y capillas: a diferencia de las categorías litúrgicas (12
// fijas + agregadas), acá NO hay una lista fija — todo, incluidas las que
// vienen de fábrica, se puede editar o borrar, porque a medida que esto se
// use en más lugares (otras ciudades, otras provincias) hace falta poder
// reorganizarlas. Cada una tiene su propio cancionero, lista de misa, QR y
// pantalla de proyección, separados del resto.
export function getSpaces() {
  try {
    const saved = JSON.parse(localStorage.getItem(SPACES_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {
    // sigue abajo y devuelve la lista de partida
  }
  return SEED_SPACES;
}

function saveSpaces(spaces) {
  localStorage.setItem(SPACES_KEY, JSON.stringify(spaces));
}

// Usado solo por storage/spacesSync.js, después de mezclar la lista local
// con lo que bajó de Supabase (última edición gana) — bypasea addSpace
// porque las keys ya vienen generadas de antes, no hay que crearlas de
// nuevo. Si la parroquia actual dejó de estar en la lista (la borraron
// desde otro dispositivo), getCurrentSpaceKey() ya cae sola a la primera
// disponible, no hace falta nada especial acá.
export function replaceSpacesFromSync(spaces) {
  saveSpaces(spaces);
}

// Vuelve "Nuestra Señora del Carmen" + "Tucumán" en "nuestra-senora-del-
// carmen-tucuman": sin tildes, en minúscula, sin nada raro — así sirve como
// identificador en la base de datos y en la URL de la página pública/QR.
// Rango Unicode de "marcas diacríticas combinantes" (los acentos sueltos
// que quedan separados de la letra después de normalize('NFD')): U+0300 a
// U+036F. Se arma con charCode en vez de escribir el rango directo en el
// regex para que no queden caracteres invisibles raros en el archivo.
const COMBINING_MARKS_REGEX = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g'
);

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '') // saca tildes (á -> a, ñ se queda igual porque no es una tilde)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

// Agrega una parroquia/capilla nueva. Devuelve el espacio creado (con su
// key ya generada) o null si no se pudo (nombre vacío). La key se genera
// una sola vez, acá, y después no cambia más aunque se edite el nombre —
// es lo que queda guardado en las canciones y listas de esa parroquia.
export function addSpace({ label, locality = '', province = '' }) {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return null;

  const spaces = getSpaces();
  const baseKey = slugify(`${trimmedLabel}-${locality}`) || slugify(trimmedLabel) || 'espacio';
  let key = baseKey;
  let suffix = 2;
  while (spaces.some((space) => space.key === key)) {
    key = `${baseKey}-${suffix}`;
    suffix += 1;
  }

  const newSpace = {
    key,
    label: trimmedLabel,
    locality: locality.trim(),
    province: province.trim(),
    updatedAt: new Date().toISOString(),
  };
  saveSpaces([...spaces, newSpace]);
  return newSpace;
}

// Cambia nombre/localidad/provincia de una parroquia ya creada. La key no
// se toca, así que las canciones/listas que ya tenía siguen encontrándola
// sin ningún problema.
export function updateSpace(key, { label, locality = '', province = '' }) {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return null;
  const updatedAt = new Date().toISOString();
  let updatedSpace = null;
  saveSpaces(
    getSpaces().map((space) => {
      if (space.key !== key) return space;
      updatedSpace = { ...space, label: trimmedLabel, locality: locality.trim(), province: province.trim(), updatedAt };
      return updatedSpace;
    })
  );
  return updatedSpace;
}

// No deja borrar la última que queda (siempre tiene que haber al menos una
// parroquia/capilla para poder usar la app). Las canciones/listas que ya
// tenía esa parroquia no se borran, solo dejan de ser accesibles desde acá
// — igual que al borrar una carpeta agregada. Devuelve la parroquia
// borrada (para que quien llama pueda avisarle a Supabase, ver
// storage/spacesSync.js) o null si no se pudo.
export function deleteSpace(key) {
  const spaces = getSpaces();
  if (spaces.length <= 1) return null;
  const deleted = spaces.find((space) => space.key === key) || null;
  saveSpaces(spaces.filter((space) => space.key !== key));
  if (getCurrentSpaceKey() === key) {
    setCurrentSpaceKey(getSpaces()[0].key);
  }
  return deleted;
}

export function getCurrentSpaceKey() {
  const saved = localStorage.getItem(CURRENT_SPACE_KEY);
  const spaces = getSpaces();
  return spaces.some((space) => space.key === saved) ? saved : spaces[0].key;
}

export function setCurrentSpaceKey(key) {
  if (!getSpaces().some((space) => space.key === key)) return;
  localStorage.setItem(CURRENT_SPACE_KEY, key);
}

export function getSpace(key) {
  return getSpaces().find((space) => space.key === key);
}

export function getSpaceLabel(key) {
  return getSpace(key)?.label || key;
}

// "Nombre — Localidad, Provincia": para cuando hace falta distinguir entre
// parroquias del mismo nombre en distintos lugares (ej. al publicar, para
// que se vea claro en la página pública de qué lugar es esa lista).
export function getSpaceFullLabel(key) {
  const space = getSpace(key);
  if (!space) return key;
  const place = [space.locality, space.province].filter(Boolean).join(', ');
  return place ? `${space.label} — ${place}` : space.label;
}

export function getCustomCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(categories) {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
}

function getCategoryOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY));
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveCategoryOrder(order) {
  localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(order));
}

// Arranca con las 12 litúrgicas fijas en su orden, más las carpetas
// agregadas al final (en el orden en que se fueron creando) — pero a
// partir de ahí, el orden real es el que haya quedado guardado después de
// usar moveCategory(): una carpeta agregada (ej. "Salmo") se puede mover
// para que quede intercalada entre las fijas, no solo al final. Es la
// lista que hay que usar en cualquier lugar de la app que necesite "todas
// las carpetas", en vez de CATEGORIES (que son solo las 12 fijas).
export function getAllCategories() {
  const all = [...CATEGORIES, ...getCustomCategories()];
  const order = getCategoryOrder();
  if (!order) return all;

  // Por si el orden guardado quedó con nombres que ya no existen (se borró
  // esa carpeta agregada), o le faltan nombres nuevos (recién agregada,
  // todavía no se guardó ningún orden con ella adentro) — esos se agregan
  // al final, como si nunca se hubiera movido nada.
  const known = new Set(all);
  const ordered = order.filter((name) => known.has(name));
  const missing = all.filter((name) => !ordered.includes(name));
  return [...ordered, ...missing];
}

// Intercambia una carpeta con la de al lado (arriba o abajo) y guarda ese
// orden. No hace nada si ya está en la punta correspondiente. Devuelve la
// lista ya actualizada, lista para volver a pintar la pantalla.
export function moveCategory(name, direction) {
  const order = getAllCategories();
  const index = order.indexOf(name);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= order.length) return order;

  const newOrder = [...order];
  [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
  saveCategoryOrder(newOrder);
  return newOrder;
}

export function isCustomCategory(name) {
  return !CATEGORIES.includes(name);
}

// Agrega una carpeta nueva. Devuelve la lista de categorías actualizada (12
// fijas + custom). Ignora nombres vacíos o repetidos (sin importar
// mayúsculas/minúsculas), tanto contra las fijas como contra otras carpetas
// ya agregadas.
export function addCustomCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return getAllCategories();

  const existingNames = getAllCategories().map((c) => c.toLowerCase());
  if (existingNames.includes(trimmed.toLowerCase())) return getAllCategories();

  saveCustomCategories([...getCustomCategories(), trimmed]);
  return getAllCategories();
}

export function deleteCustomCategory(name) {
  saveCustomCategories(getCustomCategories().filter((c) => c !== name));
  return getAllCategories();
}

// Tiempos/temas litúrgicos (ver storage/constants.js para la explicación
// de por qué es un eje aparte de las categorías). Mismo patrón que las
// carpetas agregadas: una lista fija de arranque + las que el equipo suma.
export function getCustomTags() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCustomTags(tags) {
  localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags));
}

export function getAllTags() {
  return [...LITURGICAL_TAGS, ...getCustomTags()];
}

export function isCustomTag(name) {
  return !LITURGICAL_TAGS.includes(name);
}

export function addCustomTag(name) {
  const trimmed = name.trim();
  if (!trimmed) return getAllTags();

  const existingNames = getAllTags().map((t) => t.toLowerCase());
  if (existingNames.includes(trimmed.toLowerCase())) return getAllTags();

  saveCustomTags([...getCustomTags(), trimmed]);
  return getAllTags();
}

export function deleteCustomTag(name) {
  saveCustomTags(getCustomTags().filter((t) => t !== name));
  return getAllTags();
}

// "Grupo" (ej. "CORO SÁBADO"): a diferencia de todo lo demás en este
// archivo, esto NO se sincroniza entre dispositivos a propósito — es una
// etiqueta de "quién usa ESTE dispositivo en particular", pensada para
// cuando varios grupos comparten un solo login de parroquia (en vez de un
// usuario de Supabase por grupo). Se usa para saber quién publicó/editó
// cada cosa (ver liturgia/publicar.js y views/newSongView.js) sin tener
// que crear una cuenta nueva por cada grupo. Se guarda en mayúsculas para
// que no queden variantes tipo "Coro Sábado" vs "coro sabado" mezcladas.
export function getDeviceGroup() {
  return localStorage.getItem(DEVICE_GROUP_KEY) || '';
}

export function setDeviceGroup(name) {
  const trimmed = name.trim().toUpperCase();
  if (trimmed) {
    localStorage.setItem(DEVICE_GROUP_KEY, trimmed);
  } else {
    localStorage.removeItem(DEVICE_GROUP_KEY);
  }
}

export function getHeaderTitle() {
  return localStorage.getItem(HEADER_TITLE_KEY) || DEFAULT_HEADER_TITLE;
}

export function setHeaderTitle(title) {
  const trimmed = title.trim();
  localStorage.setItem(HEADER_TITLE_KEY, trimmed || DEFAULT_HEADER_TITLE);
}
