// Tests simples, sin librería. Correr con: node src/storage/settings.test.js
// Node no tiene `localStorage` global (es una API de navegador): armamos un
// stub mínimo en memoria antes de importar settings.js, que lo usa adentro.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
})();

// Tampoco hay `window.matchMedia` en Node: lo simulamos con un valor que
// podemos cambiar a mano en el test de "seguir el tema del sistema".
let prefiereOscuroDelSistema = false;
globalThis.window = {
  matchMedia: () => ({ matches: prefiereOscuroDelSistema }),
};

const {
  getAllCategories,
  isCustomCategory,
  addCustomCategory,
  deleteCustomCategory,
  getHeaderTitle,
  setHeaderTitle,
  DEFAULT_HEADER_TITLE,
  getSpaces,
  addSpace,
  updateSpace,
  deleteSpace,
  getCurrentSpaceKey,
  setCurrentSpaceKey,
  getSpaceLabel,
  getSpaceFullLabel,
  getStoredTheme,
  setStoredTheme,
  getEffectiveTheme,
} = await import('./settings.js');
const { CATEGORIES } = await import('./constants.js');

let failures = 0;

function assertEqual(actual, expected, label) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.log(`FAIL: ${label}`);
    console.log(`  esperado: ${JSON.stringify(expected)}`);
    console.log(`  obtenido: ${JSON.stringify(actual)}`);
  }
}

// --- arranca solo con las 12 fijas ---
assertEqual(getAllCategories(), CATEGORIES, 'sin carpetas agregadas, getAllCategories da solo las 12 fijas');
assertEqual(isCustomCategory('ENTRADA'), false, 'una categoría fija no es "custom"');

// --- agregar una carpeta nueva ---
addCustomCategory('Navidad');
assertEqual(getAllCategories(), [...CATEGORIES, 'Navidad'], 'la carpeta agregada queda al final, después de las 12 fijas');
assertEqual(isCustomCategory('Navidad'), true, 'una carpeta agregada sí es "custom"');

// --- no deja agregar duplicados (ni contra las fijas, ni entre sí) ---
addCustomCategory('navidad'); // mismo nombre, distinta mayúscula/minúscula
assertEqual(getAllCategories().filter((c) => c.toLowerCase() === 'navidad').length, 1, 'no se duplica una carpeta ya agregada');
addCustomCategory('ENTRADA');
assertEqual(getAllCategories().filter((c) => c.toLowerCase() === 'entrada').length, 1, 'no se puede agregar una carpeta con el nombre de una fija');

// --- nombre vacío no agrega nada ---
const antesDeVacio = getAllCategories();
addCustomCategory('   ');
assertEqual(getAllCategories(), antesDeVacio, 'un nombre vacío no agrega ninguna carpeta');

// --- eliminar una carpeta agregada ---
deleteCustomCategory('Navidad');
assertEqual(getAllCategories(), CATEGORIES, 'eliminar la carpeta agregada vuelve a dejar solo las 12 fijas');

// --- título del header ---
assertEqual(getHeaderTitle(), DEFAULT_HEADER_TITLE, 'sin cambiarlo, el título por defecto es "Cancionero"');
setHeaderTitle('Parroquia San José');
assertEqual(getHeaderTitle(), 'Parroquia San José', 'setHeaderTitle guarda el nuevo título');
setHeaderTitle('   ');
assertEqual(getHeaderTitle(), DEFAULT_HEADER_TITLE, 'un título vacío vuelve al valor por defecto, no lo deja en blanco');

// --- espacios (parroquias/capillas) ---
const espaciosDePartida = getSpaces();
assertEqual(getCurrentSpaceKey(), espaciosDePartida[0].key, 'sin elegir ninguno, el espacio actual es el primero de la lista');
setCurrentSpaceKey('maria-auxiliadora');
assertEqual(getCurrentSpaceKey(), 'maria-auxiliadora', 'setCurrentSpaceKey cambia el espacio actual');
setCurrentSpaceKey('un-espacio-que-no-existe');
assertEqual(getCurrentSpaceKey(), 'maria-auxiliadora', 'un espacio inválido se ignora, se mantiene el anterior');
assertEqual(getSpaceLabel('merced'), 'Nuestra Señora de la Merced', 'getSpaceLabel devuelve el nombre para mostrar');
assertEqual(getSpaceLabel('no-existe'), 'no-existe', 'getSpaceLabel devuelve la key tal cual si no la encuentra');
assertEqual(
  getSpaceFullLabel('merced'),
  'Nuestra Señora de la Merced — Ushuaia, Tierra del Fuego',
  'getSpaceFullLabel agrega localidad y provincia'
);

// --- agregar una parroquia/capilla nueva ---
const nuevaCapilla = addSpace({ label: 'Nuestra Señora del Carmen', locality: 'Tucumán', province: 'Tucumán' });
assertEqual(nuevaCapilla.key, 'nuestra-senora-del-carmen-tucuman', 'addSpace genera una key sin tildes ni espacios');
assertEqual(getSpaces().length, espaciosDePartida.length + 1, 'addSpace suma una parroquia a la lista');

// --- no deja agregar con nombre vacío ---
assertEqual(addSpace({ label: '   ' }), null, 'addSpace con nombre vacío no agrega nada, devuelve null');

// --- dos parroquias con el mismo nombre y localidad no chocan de key ---
const otraDelCarmen = addSpace({ label: 'Nuestra Señora del Carmen', locality: 'Tucumán', province: 'Tucumán' });
assertEqual(otraDelCarmen.key, 'nuestra-senora-del-carmen-tucuman-2', 'una key repetida se resuelve agregando un sufijo');

// --- editar no cambia la key ---
updateSpace(nuevaCapilla.key, { label: 'Nuestra Señora del Carmen (cambiado)', locality: 'San Miguel de Tucumán', province: 'Tucumán' });
assertEqual(
  getSpaces().find((s) => s.key === nuevaCapilla.key)?.label,
  'Nuestra Señora del Carmen (cambiado)',
  'updateSpace cambia el nombre sin tocar la key'
);

// --- borrar ---
deleteSpace(otraDelCarmen.key);
assertEqual(
  getSpaces().some((s) => s.key === otraDelCarmen.key),
  false,
  'deleteSpace saca la parroquia de la lista'
);

// --- no deja borrar la última que queda ---
for (const space of getSpaces().slice(1)) deleteSpace(space.key);
assertEqual(getSpaces().length, 1, 'se puede borrar hasta dejar una sola');
assertEqual(deleteSpace(getSpaces()[0].key), false, 'no deja borrar la única parroquia que queda');
assertEqual(getSpaces().length, 1, 'sigue habiendo una parroquia después de intentar borrar la última');

// --- tema (claro/oscuro) ---
assertEqual(getStoredTheme(), null, 'sin elegir nada a mano, no hay tema guardado');
assertEqual(getEffectiveTheme(), 'light', 'sin elección y sin preferencia del sistema, el efectivo es claro');
prefiereOscuroDelSistema = true;
assertEqual(getEffectiveTheme(), 'dark', 'sin elección pero con el sistema en oscuro, el efectivo sigue al sistema');
setStoredTheme('light');
assertEqual(getEffectiveTheme(), 'light', 'una elección a mano gana por encima de la preferencia del sistema');
assertEqual(getStoredTheme(), 'light', 'getStoredTheme refleja la elección explícita');
setStoredTheme(null);
assertEqual(getStoredTheme(), null, 'volver a "seguir el sistema" borra la elección guardada');
prefiereOscuroDelSistema = false;

if (failures === 0) {
  console.log('\nTodos los tests pasaron');
} else {
  console.log(`\n${failures} test(s) fallaron`);
  process.exitCode = 1;
}
