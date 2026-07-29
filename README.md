# Cancionero litúrgico + lista dinámica por QR

Dos partes conectadas por una sola base de datos (Supabase):

- **`app-equipo/`** — PWA offline para el equipo de música: cancionero por
  categoría litúrgica, armado de la lista de cada misa, y "Publicar".
- **`pagina-publica/`** — página estática de solo lectura que ven los
  feligreses al escanear el QR fijo.
- **`supabase/`** — el SQL y las instrucciones para configurar la base de
  datos compartida entre las dos partes (ver [`supabase/SETUP.md`](./supabase/SETUP.md)).

## Orden para poner todo en marcha

1. **Supabase**: seguir [`supabase/SETUP.md`](./supabase/SETUP.md) — crear la
   tabla, las políticas de seguridad, y un usuario para el equipo.
2. **App del equipo** (`app-equipo/`):
   ```bash
   cd app-equipo
   npm install
   npm run dev
   ```
   Abre en `http://localhost:5173`. Antes de poder publicar, completar
   `src/storage/supabaseClient.js` con la URL y anon key de tu proyecto
   (paso 3 de `SETUP.md`).
3. **Página pública** (`pagina-publica/`): completar `app.js` con las mismas
   credenciales, y subir la carpeta a GitHub Pages (ver más abajo).
4. **Instalar la app en la tablet**: con `npm run build` (adentro de
   `app-equipo/`) y sirviendo la carpeta `dist/`, abrir esa URL en la tablet
   y usar "Agregar a pantalla de inicio" del navegador — así queda instalada
   como app y funciona sin conexión.
5. **QR**: una vez que la página pública tenga su URL definitiva de GitHub
   Pages, pegarla en `app-equipo/src/views/qrView.js` (constante
   `PUBLIC_URL`) y en la app ir a "Ver QR" para generarlo. Se imprime o se
   muestra una sola vez.

## Publicar `pagina-publica/` en GitHub Pages

Es una carpeta de HTML/CSS/JS sin build, así que no hace falta compilar nada:

1. Crear un repositorio en GitHub (puede ser este mismo `cancionero-iglesia`,
   o uno aparte solo para la página pública).
2. Subir el contenido de `pagina-publica/` a ese repo (en la raíz, o en una
   carpeta `docs/` — lo que sea más cómodo).
3. En GitHub: **Settings → Pages → Source**, elegir la rama y carpeta donde
   quedó `index.html`.
4. GitHub va a dar una URL del tipo `https://tu-usuario.github.io/tu-repo/`
   — esa es la URL fija que va en el QR (paso 5 de arriba).

## Qué necesita internet y qué no

- **100% offline, siempre**: cancionero completo, alta/edición de canciones,
  visor con transposición y autoscroll, armado de la lista de misa.
- **Necesita internet**: iniciar sesión por primera vez, "Publicar", y la
  página pública (con el dato móvil del feligrés, no el wifi de la tablet).
- Una vez logueado una vez con internet, el equipo puede seguir usando la
  tablet sin conexión — la sesión queda guardada en el dispositivo.
