# Configurar Supabase (una sola vez)

Vos ya tenés un proyecto de Supabase creado. Estos son los pasos para dejarlo
listo para este sistema. Ninguno de estos pasos lo puedo hacer yo por vos —
todos requieren que entres con tu cuenta.

## 1. Crear la tabla y las políticas de seguridad

1. Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) → elegí tu proyecto.
2. Menú lateral → **SQL Editor** → **New query**.
3. Pegá todo el contenido de [`schema.sql`](./schema.sql) y tocá **Run**.
4. Deberías ver "Success. No rows returned". Si da error de "already exists",
   ya estaba creado — no pasa nada, podés ignorarlo.

Esto crea dos tablas:

- **`lista_actual`** (pública, sin acordes): la usa la página del QR.
  - Lectura: cualquiera puede leer, sin login.
  - Escritura: solo con sesión de Supabase Auth iniciada.
- **`songs`** (privada, con acordes incluidos): el cancionero completo,
  para que se sincronice entre las tablets/celulares del equipo — si
  alguien agrega una canción desde su celu en el ensayo, aparece en la
  tablet (y en los demás celus) la próxima vez que sincronicen.
  - Lectura Y escritura: solo con sesión iniciada. Ni siquiera puede
    leerla alguien sin loguearse — a propósito, porque acá sí viajan los
    acordes, que no son para que los vea cualquiera que escanee el QR.

## 2. Crear un usuario para el equipo, y decir qué parroquia puede tocar

Cada persona necesita DOS cosas: una cuenta de login (acá abajo), y una fila
en `team_members` que diga qué parroquia(s) puede tocar (paso 8). Sin la
segunda parte, puede iniciar sesión pero no va a poder publicar ni
sincronizar nada — es la protección real, no solo un botón oculto.

1. Menú lateral → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Cargá un email y una contraseña. Si varias parroquias van a usar el mismo
   proyecto de Supabase (ver más abajo, "varias parroquias"), cada persona
   necesita un email distinto — si todas usan tu mismo email, podés armar
   variantes con "+" que igual te llegan a tu bandeja: `tuemail+merced@gmail.com`,
   `tuemail+tucuman@gmail.com`, etc. (esto funciona en Gmail; en otros
   proveedores de email puede que no).
3. Marcá **Auto Confirm User** para que quede activo al toque, sin tener que
   confirmar por email.
4. Copiá el **User UID** que le quedó asignado (se ve en la lista de Users,
   es un código largo tipo `a1b2c3d4-...`) — lo vas a necesitar en el paso 8.

Repetí esto por cada persona del equipo que quieras que pueda publicar o
sincronizar, en cualquier parroquia.

## 3. Copiar la URL y la clave pública (anon key)

1. Menú lateral → **Settings** → **API**.
2. Copiá **Project URL** y la clave **anon public** (NO la `service_role`,
   esa nunca va en el frontend).
3. Pegalas en dos archivos:
   - `app-equipo/src/storage/supabaseClient.js` (constantes `SUPABASE_URL` y `SUPABASE_ANON_KEY`)
   - `pagina-publica/app.js` (mismas constantes, arriba del todo)

La anon key **no es secreta** — está diseñada para vivir en código público de
frontend. La seguridad real la da RLS (paso 1), no ocultar esta clave.

## 4. Probar que la escritura sin login se rechaza

Esto confirma que la protección es real (del lado del servidor), no solo que
la página pública "no tiene botón para escribir".

Con la página pública abierta en el navegador (sin haber iniciado sesión en
ningún lado), abrí la consola del navegador (F12) y pegá esto, reemplazando
`TU_URL` y `TU_ANON_KEY` por los tuyos:

```js
fetch('TU_URL/rest/v1/lista_actual', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: 'TU_ANON_KEY',
    Authorization: 'Bearer TU_ANON_KEY',
  },
  body: JSON.stringify({ fecha: '2099-01-01', items: [] }),
}).then((r) => r.json()).then(console.log);
```

Tiene que devolver un error (algo como `new row violates row-level security
policy`). Si en cambio devuelve el registro creado, algo quedó mal
configurado en el paso 1 — revisá que RLS esté "Enabled" en Database → Tables
→ `lista_actual`.

## 5. Probar que ni siquiera se puede LEER el cancionero (`songs`) sin login

A diferencia de `lista_actual`, la tabla `songs` tiene los acordes — no debería
poder leerla nadie que no esté logueado. Con los mismos `TU_URL`/`TU_ANON_KEY`
de antes, pero esta vez un GET:

```js
fetch('TU_URL/rest/v1/songs?select=*', {
  headers: { apikey: 'TU_ANON_KEY', Authorization: 'Bearer TU_ANON_KEY' },
}).then((r) => r.json()).then(console.log);
```

Tiene que devolver un array vacío `[]` (RLS filtra todo, ni error hace
falta) — nunca las canciones. Si devuelve canciones con sus acordes, revisá
que RLS esté "Enabled" en `songs` y que no haya quedado ninguna política
que le dé acceso a `anon` por error.

## 6. (Más adelante) Actualizar la app cuando cambien las credenciales

Si alguna vez rotás la anon key o cambiás de proyecto de Supabase, solo hay
que actualizar esos mismos dos archivos del paso 3 — no hace falta tocar
nada más.

## 7. Ya corriste esto antes y ahora hay varias parroquias (espacios)

Si ya habías hecho el paso 1 antes de que existiera el concepto de
"espacio" (una parroquia por lista/cancionero), no vuelvas a pegar
`schema.sql` entero — correr de nuevo las políticas ya creadas tira error y
puede cortar la ejecución antes de llegar a lo nuevo. En su lugar:

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-espacios.sql`](./migracion-espacios.sql) y tocá **Run**.

Esto agrega la columna `space` a las dos tablas (todo lo que ya tenías
cargado queda asignado a `merced` por defecto) y ajusta la lista publicada
para que sea única por parroquia + fecha, no solo por fecha.

## 8. Restringir quién puede tocar cada parroquia (team_members)

Por defecto, cualquier usuario logueado puede publicar/sincronizar
CUALQUIER parroquia. Si vas a tener equipos de distintos lugares que no se
conocen entre sí (ej. Ushuaia y Tucumán), conviene restringir esto: cada
uno solo toca lo suyo, y vos (como responsable de todo) tenés acceso a
todas.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-permisos.sql`](./migracion-permisos.sql) y tocá **Run**.

Esto crea la tabla `team_members` y cambia las políticas de `songs` y
`lista_actual` para que chequeen esa tabla en vez de dejar pasar a
cualquier usuario logueado. **Importante:** apenas corras esto, NADIE va a
poder publicar ni sincronizar (ni siquiera vos) hasta que sigas el paso
siguiente.

**Cargar el equipo en `team_members`** (esto se hace siempre, tanto si
instalaste todo de cero con `schema.sql` como si acabás de correr la
migración):

1. Menú lateral → **Table Editor** → elegí la tabla **team_members**.
2. Botón **Insert** → **Insert row**.
3. `user_id`: pegá el User UID que copiaste en el paso 2 para esa persona.
4. Para vos (acceso a todo): marcá `is_admin` en `true`, dejá `spaces` vacío.
5. Para alguien de una sola parroquia: dejá `is_admin` en `false`, y en
   `spaces` cargá un array con la key de esa parroquia, ej. `{merced}` o
   `{merced,maria-auxiliadora}` si puede tocar más de una. La key es el
   identificador técnico que se ve en la app: **Parroquias y capillas** →
   tocá ✏️ en la que te interesa, o mirá la URL del QR de esa parroquia
   (`?space=...`).
6. Guardá. Repetí una fila por persona.

**Probar que la restricción es real:** logueate en la app con un usuario
que solo tenga, por ejemplo, `{tucuman}` en `spaces`, cambiá el selector de
parroquia a una de Ushuaia, y confirmá que "Sincronizar" o "Publicar" fallan
(mensaje de "no se pudo..."). Esa es la prueba de que el rechazo pasa en el
servidor, no en la pantalla.

## 9. Novedades (avisos, eventos, lecturas del día)

Agrega una tabla `anuncios` para la sección "Novedades" — avisos como
"VIACRUCIS VIERNES 15 HS" o las lecturas de la semana, que se ven en la
página pública junto con los cantos. Mismo esquema de permisos que todo lo
demás: lectura pública, escritura solo para el equipo autorizado de esa
parroquia (`team_members`).

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-anuncios.sql`](./migracion-anuncios.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: la tabla `anuncios` ya está incluida ahí.

Se administra desde la app, en **📣 Novedades** (junto a "Ver publicada"),
con sesión iniciada.

## 10. Compartir canciones entre parroquias

Agrega la posibilidad de marcar una canción como "Compartir con otras
parroquias" — el resto de los equipos (de cualquier parroquia del mismo
proyecto de Supabase) la puede ver en **📚 Compartidas** y copiarla a su
propio cancionero con un botón, en vez de tipearla o pegarla de nuevo desde
cero. La copia es independiente: cada parroquia puede después editarla sin
afectar a la original.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-compartir.sql`](./migracion-compartir.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

No hace falta que las canciones a compartir tengan derechos "libres" ni
nada especial — es lo mismo que ya hace cada equipo hoy con lo que usa en
su propia misa, solo que ahora, si quieren, se lo pueden facilitar a otra
parroquia en vez de que esa persona tenga que tipearlo de cero.

## 11. Logo de cada parroquia/capilla

Agrega un banner chico con el logo (arriba de todo, en la página del QR y
en "Ver publicada" dentro de la app) — más fácil para reconocer de un
vistazo de qué parroquia es cada pantalla.

**Paso 1 — crear el bucket de Storage** (una sola vez, a mano):

1. Menú lateral → **Storage** → **New bucket**.
2. Nombre: `logos` (tal cual, en minúscula).
3. Tildá **Public bucket**.
4. **Create bucket**.

**Paso 2 — correr la migración:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-logos.sql`](./migracion-logos.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta la
migración — ya está incluida ahí (igual creá el bucket a mano como en el
paso 1, eso no lo puede hacer un script SQL).

Se sube desde la app, en **⚙️ Parroquias y capillas** → ícono 🖼️ junto a
cada una, con sesión iniciada. Una foto nueva reemplaza a la anterior (no
hace falta borrar nada a mano).
