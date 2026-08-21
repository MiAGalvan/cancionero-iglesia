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

## 12. Tiempos/temas litúrgicos (filtro en Lista de misa)

Agrega la columna `tags` a las canciones — un eje aparte de las categorías
(que son el *momento* de la misa: Entrada, Comunión...). Sirve para acotar
las opciones de "Lista de misa" según el tiempo litúrgico de la semana
(Cuaresma, Pascua, Buen Pastor, etc.), eligiéndolo al cargar/editar cada
canción.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-tags.sql`](./migracion-tags.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

## 13. Sincronizar la lista de parroquias/capillas entre dispositivos

Antes, "Parroquias y capillas" vivía solo en el localStorage de cada
dispositivo — si agregabas una parroquia desde la compu, no aparecía sola
en el celular; había que cargarla a mano en cada uno. Esto lo sincroniza
como el resto: agregar/editar una parroquia en un dispositivo la hace
aparecer en los demás (con sesión iniciada), automáticamente al loguearse
o al tocar 🔄 en la biblioteca.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-espacios-sync.sql`](./migracion-espacios-sync.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

**Importante:** la primera vez que corras esto, cada dispositivo puede
tener su propia lista local, un poco distinta (por ejemplo, si agregaste
Tucumán solo en la compu). Al loguearte o sincronizar en cada dispositivo,
las listas se mezclan automáticamente por fecha de última edición — no
hace falta borrar ni volver a cargar nada a mano.

## 14. Quién publicó/editó cada cosa

Agrega `published_by` (en `lista_actual`) y `updated_by` (en `songs`): el
email de la cuenta que tocó "Publicar" o guardó una canción por última
vez. Se ve dentro de la app ("Ver publicada" y el visor de cada canción)
— **nunca en la página pública**, para no exponer emails de voluntarios a
los feligreses.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-trazabilidad.sql`](./migracion-trazabilidad.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

## 15. "Todas las canciones" para el admin

En **📚 Compartidas**, si entrás con una cuenta `is_admin: true` (ver paso
8), en vez de ver solo lo que cada parroquia marcó "compartir", ves el
cancionero completo de TODAS las parroquias — pensado para vos, como
responsable de todo el sistema, para tener un lugar único donde mirar o
copiar cualquier canción de cualquier parroquia. El resto del equipo (sin
`is_admin`) sigue viendo solo lo que se compartió a propósito. No necesita
ninguna migración aparte — usa los mismos permisos que ya tenías.

## 16. Sincronizar carpetas agregadas y tiempos/temas litúrgicos

Antes, las carpetas que agregaban (ej. "Salmo") y los tiempos/temas
litúrgicos agregados vivían solo en el localStorage de cada dispositivo —
agregar uno en el celu no aparecía en la compu. A diferencia de las
parroquias, esto NO es por parroquia: se comparte entre todas, así que
cualquier integrante logueado (de cualquier parroquia) lo puede ver y
agregar.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-labels.sql`](./migracion-labels.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

## 17. Traducción automática de la lista publicada (portugués/inglés, para turistas)

Agrega un selector ES/PT/EN en la lista pública (la del QR): al tocar PT o
EN, `pagina-publica/app.js` le pide la traducción a Google Translate (el
mismo servicio gratuito que usan los navegadores) directo desde el
navegador del visitante — nadie del equipo tiene que cargar ni pegar nada a
mano. No requiere ninguna tabla, columna ni migración nueva en Supabase:
es puro frontend, ya viene andando apenas se actualiza `pagina-publica`.

Un detalle honesto: es un endpoint gratuito no oficial de Google (sin API
key), el mismo que usan muchas extensiones de traducción — funciona bien en
la práctica, pero al no ser una API con contrato firme, si algún día Google
lo restringe, la traducción dejaría de funcionar (la página se queda
mostrando español, no se rompe del todo).

## 18. Grabaciones de audio (cómo canta cada grupo cada canción)

Un botón "🎙️ Grabar" en el visor de la canción graba con el micrófono y
guarda el audio, organizado por parroquia y por Grupo (ver punto de "Grupo"
más arriba). Se puede escuchar cómo canta la MISMA canción cada
parroquia/grupo desde "📚 Compartidas" → ícono 🎧. Volver a grabar la misma
canción con el mismo grupo reemplaza la grabación anterior (no se
acumulan archivos sueltos).

**Paso 1 — crear el bucket de Storage** (una sola vez, a mano):

1. Menú lateral → **Storage** → **New bucket**.
2. Nombre: `grabaciones` (tal cual, en minúscula).
3. Tildá **Public bucket**.
4. **Create bucket**.

**Paso 2 — correr la migración:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-grabaciones.sql`](./migracion-grabaciones.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta la
migración — ya está incluida ahí (igual creá el bucket a mano como en el
paso 1, eso no lo puede hacer un script SQL).

⚠️ Importante el orden acá también: creá el bucket y corré la migración
ANTES de actualizar el código de la app — el botón "Grabar" intenta subir a
la tabla/bucket apenas se toca.

## 19. Página pública como "app": Inicio, próxima misa y Lecturas

La página del QR pasa a tener 3 pantallas en vez de una: el QR sigue yendo
directo a **Canciones** (como siempre, no se rompe ningún QR ya impreso),
pero al final aparece un botón **"🔔 Enterate de lo próximo"** que lleva a
**Inicio** (nombre de la parroquia, "¿Vas a misa hoy?" con la próxima misa
y la dirección) y de ahí a **Lecturas**.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-proxima-misa.sql`](./migracion-proxima-misa.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

**Cargar la próxima misa y la dirección:** desde la app, **⚙️ Parroquias y
capillas** → ✏️ (editar) → te va a preguntar, además de lo de siempre,
la dirección y la próxima misa (escribila tal cual la querés ver, por
ejemplo `Miércoles 19 de agosto, 19:00 hs` — es texto libre, no hay que
respetar ningún formato especial).

**Cargar las lecturas del día:** en **📣 Novedades**, cargá un aviso por
cada lectura, con el título EXACTO (mayúscula o minúscula da igual):
`1ª Lectura` (o `1ra Lectura`), `Salmo`, `2ª Lectura` (o `2da Lectura`) y
`Evangelio` — el texto de cada lectura va en el cuerpo, sin agregarle nada
más al título (ej. la referencia bíblica), porque si no deja de coincidir
con el título exacto y se muestra como un aviso común en vez de como
lectura. Desde la versión más reciente, en **📣 Novedades** hay 4 botones
(uno por lectura) que abren el formulario ya con el título correcto
cargado, para no tener que tipearlo a mano.

## 20. Redes sociales de cada parroquia

Un renglón "📱 Seguinos en redes" al fondo de **Inicio**, más una pantalla
propia (`#/redes`) pensada para compartir directo (bio de Instagram,
WhatsApp) sin pasar primero por la lista de cantos — por ejemplo
`https://tu-pagina.vercel.app/?space=merced#/redes`.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-redes-sociales.sql`](./migracion-redes-sociales.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

**Cargar los links:** desde la app, **📣 Novedades** → sección "🔗 Redes
sociales" → pegá el link completo de cada red que tenga esa parroquia
(Instagram, Facebook, YouTube, WhatsApp — dejá vacía la que no use) →
**Guardar**. La que no tenga link cargado directamente no se muestra, ni
en Inicio ni en la pantalla de redes.

## 21. Fecha de las lecturas (hoy vs. una misa programada)

Si cargás las lecturas con anticipación (ej. el jueves cargás ya las del
domingo que viene), la página pública necesita saber que esas lecturas
son para el domingo y no para hoy — si no, "Mira las lecturas" y la
pantalla de Lecturas iban a mostrarlas siempre como si fueran del día,
sin ninguna aclaración.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-fecha-lecturas.sql`](./migracion-fecha-lecturas.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

**Cómo se usa:** en **📣 Novedades**, al tocar cualquiera de los 4
botones de lectura (1ª Lectura, Salmo, 2ª Lectura, Evangelio) aparece,
además del título, un campo de **fecha** — por defecto trae la de hoy,
pero se puede cambiar a la fecha de la misa para la que es esa lectura
(ej. el domingo próximo). Las 4 se cargan normalmente con la misma
fecha. Un aviso común (no una lectura) no tiene este campo, no lo
necesita.

En la página pública, si la fecha de las lecturas es la de hoy no se
avisa nada especial (es el caso normal); si es una fecha futura, tanto
el link "Mira las lecturas" en Inicio como el título de la pantalla de
Lecturas muestran **🕓 Próximamente** junto con la fecha, para que quede
claro que todavía no es el día. Es el mismo aviso que ya usa la lista de
canciones publicada.

## 22. Horario semanal recurrente y otras capillas

Hasta ahora "próxima misa" era un texto libre que había que ir
actualizando a mano. Ahora se puede cargar, en cambio, un horario que se
repite todas las semanas (ej. "domingos 11:00 hs", "miércoles 19:00 hs")
y la página pública calcula sola cuál es la próxima, sin que nadie tenga
que volver a tocarlo — sigue funcionando aunque pasen semanas sin entrar
a la app.

También se pueden agregar otras capillas que pertenecen a la misma
parroquia (ej. Merced tiene misa en una capilla los miércoles) — son
solo informativas: nombre, dirección y horario en texto libre, sin
cancionero ni QR propio. Aparecen en una pantalla aparte para no
confundirlas con la misa principal.

**Si ya tenías el proyecto armado de antes:**

1. **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`migracion-horarios-capillas.sql`](./migracion-horarios-capillas.sql) y tocá **Run**.

Si estás instalando todo de cero con `schema.sql`, no hace falta nada
extra: ya está incluido ahí.

**Cargar el horario semanal:** desde la app, **📣 Novedades** → sección
"🗓️ Horario semanal" → **+ Agregar horario** por cada día que hay misa,
elegís el día, la hora de inicio y (opcional) la hora "hasta" → **Guardar**.
Si no cargás ningún horario acá, la página pública sigue usando el texto
libre de "Próxima misa" de siempre.

El campo "hasta" es lo que hace que el aviso **"🔴 En vivo hoy"** sea
preciso: sin cargarlo, se muestra en vivo el resto del día una vez que
llega la hora de inicio; cargándolo, en cuanto llega esa hora de fin la
página pasa directo a mostrar la próxima misa programada.

**Agregar una capilla:** en la misma pantalla, sección "⛪ Otras
capillas" → **+ Agregar capilla** → nombre, dirección y horario (texto
libre, ej. "Miércoles 19:00 hs"). Se puede editar o eliminar después
desde la lista. En la página pública aparecen en "Mira otras capillas y
horarios", un link que solo se muestra en Inicio si hay al menos una
capilla cargada.

## 23. Instalar la página pública como app (sin pasar por el menú del navegador)

Antes, la única forma de tener un acceso directo era la opción genérica
"Crear acceso directo" del navegador — muchas personas no la conocen, y
queda con un ícono gris sin identidad. Ahora la pantalla de Inicio tiene
su propio botón **"📲 Instalar esta app en el celular"**: en Android
(Chrome) dispara directo el cartel nativo de instalación, con el ícono
propio del cancionero (ver `pagina-publica/icons/`) y el nombre de esa
parroquia en particular. En iPhone (Safari no permite disparar ese
cartel desde código) el botón se reemplaza por un cartelito explicando
cómo hacerlo a mano: Compartir → Agregar a inicio.

No requiere ninguna migración ni configuración — es todo del lado de
`pagina-publica` (`sw.js` nuevo, y un manifest que se arma solo en
memoria con el nombre y el link de cada parroquia). Cada parroquia queda
con su propio ícono en la pantalla de inicio del celular, y al tocarlo
abre directo en esa parroquia — no hace falta volver a elegir nada.
