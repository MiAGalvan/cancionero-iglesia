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

## 2. Crear un usuario para el equipo

1. Menú lateral → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Cargá un email y una contraseña (puede ser una cuenta compartida del
   equipo, o una por integrante — a gusto).
3. Marcá **Auto Confirm User** para que quede activo al toque, sin tener que
   confirmar por email.

Repetí este paso por cada persona del equipo que quieras que pueda publicar.

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
