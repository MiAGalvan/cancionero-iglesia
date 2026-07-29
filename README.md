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

## Espacios (parroquias)

Todo — cancionero, listas de misa, lista publicada, QR y pantalla de
proyección — está separado por "espacio": cada parroquia tiene el suyo
propio, independiente de las demás, aunque comparten la misma app y el
mismo login del equipo. Hoy son tres (ver `app-equipo/src/storage/constants.js`):

- Nuestra Señora de la Merced
- María Auxiliadora
- General (para misas conjuntas)

Se cambia de espacio con el selector de la barra superior de la biblioteca.

## Orden para poner todo en marcha

1. **Supabase**: seguir [`supabase/SETUP.md`](./supabase/SETUP.md) — crear las
   tablas, las políticas de seguridad, y un usuario para el equipo. Si el
   proyecto de Supabase ya estaba armado antes de que existieran los
   "espacios", correr además `supabase/migracion-espacios.sql` (paso 7 de `SETUP.md`).
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
