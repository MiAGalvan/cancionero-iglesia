# Cancionero litúrgico + lista dinámica por QR

Tres partes conectadas por Supabase:

- **`app-equipo/`** — PWA offline para el equipo de música: cancionero por
  categoría litúrgica (con editor visual de acordes), armado de la lista de
  cada misa, "Publicar", sincronización del cancionero entre dispositivos, y
  dos pantallas de solo lectura sin login ("Ver publicada" y "Modo
  proyección" para HDMI). Desplegada en Netlify.
- **`pagina-publica/`** — página estática de solo lectura que ven los
  feligreses al escanear el QR fijo.
- **`supabase/`** — el SQL y las instrucciones para configurar la base de
  datos compartida entre las dos partes (ver [`supabase/SETUP.md`](./supabase/SETUP.md)).

## Espacios (parroquias y capillas)

Todo — cancionero, listas de misa, lista publicada, QR y pantalla de
proyección — está separado por "espacio": cada parroquia o capilla tiene el
suyo propio, independiente de las demás. Se agregan, editan (nombre,
localidad, provincia) o borran desde **⚙️** en la biblioteca — pensado para
usarse en varias ciudades/provincias a la vez, no solo en una. Se cambia de
espacio con el selector de la barra superior, agrupado por provincia.

## Permisos por parroquia (team_members)

Por defecto cualquier usuario logueado puede publicar/sincronizar
cualquier parroquia. Si vas a tener equipos de lugares distintos que no se
conocen entre sí, seguí el paso 8 de `SETUP.md` para restringir esto: una
tabla `team_members` en Supabase dice qué parroquia(s) puede tocar cada
usuario (`is_admin: true` = todas, para el responsable general del
sistema). Es una restricción real del lado del servidor (RLS), no solo un
botón oculto en la app.

## Orden para poner todo en marcha

1. **Supabase**: seguir [`supabase/SETUP.md`](./supabase/SETUP.md) — crear las
   tablas, las políticas de seguridad, un usuario por persona del equipo, y
   quién puede tocar qué parroquia (`team_members`, paso 8). Si el proyecto
   de Supabase ya estaba armado de antes, correr además
   `supabase/migracion-espacios.sql` y `supabase/migracion-permisos.sql`
   (pasos 7 y 8 de `SETUP.md`).
2. **App del equipo** (`app-equipo/`):
   ```bash
   cd app-equipo
   npm install
   npm run dev
   ```
   Antes de poder publicar/sincronizar, completar
   `src/storage/supabaseClient.js` con la URL y anon key de tu proyecto
   (paso 3 de `SETUP.md`).
3. **Página pública** (`pagina-publica/`): completar `app.js` con las mismas
   credenciales, y desplegarla (GitHub Pages, Netlify o Vercel).
4. **Desplegar `app-equipo/`**: en Netlify (o similar), con **Base
   directory**: `app-equipo`, **Build command**: `npm run build`, **Publish
   directory**: `dist`. No hace falta configurar variables de entorno, las
   credenciales ya están en el código.
5. **Instalar la app en la tablet/celular**: abrir la URL desplegada y usar
   "Agregar a pantalla de inicio" del navegador — así queda instalada como
   app y funciona sin conexión.
6. **QR**: una vez que la página pública tenga su URL definitiva, pegarla en
   `app-equipo/src/views/qrView.js` (constante `PUBLIC_URL`) y en la app ir
   a "Ver QR" — hay uno distinto por cada espacio/parroquia.

## Qué necesita internet y qué no

- **100% offline, siempre**: cancionero completo (por espacio), alta/edición
  de canciones (con editor visual de acordes), visor con transposición y
  autoscroll, armado de la lista de misa.
- **Necesita internet**: iniciar sesión por primera vez, "Publicar",
  sincronizar el cancionero con otros dispositivos, y las pantallas de solo
  lectura ("Ver publicada", "Modo proyección", y la página pública del QR).
- Una vez logueado una vez con internet, el equipo puede seguir usando la
  tablet sin conexión — la sesión queda guardada en el dispositivo.

## Sincronización del cancionero

Cada canción tiene un `uuid` estable (no el id local, que es distinto en
cada dispositivo). Al sincronizar (botón 🔄, o automático después de
loguearse/guardar una canción), se compara `updatedAt`: gana la versión
guardada más tarde. Es una regla simple pensada para un equipo chico de
voluntarios — si dos personas editan la misma canción sin conexión al mismo
tiempo, se queda la última que sincronizó, no se hace un merge línea por
línea.
