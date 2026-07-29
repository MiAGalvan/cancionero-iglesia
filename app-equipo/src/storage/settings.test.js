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

const {
  getAllCategories,
  isCustomCategory,
  addCustomCategory,
  deleteCustomCategory,
  getHeaderTitle,
  setHeaderTitle,
  DEFAULT_HEADER_TITLE,
} = await import('./settings.js');
const { CATEGORIES } = await import('./db.js');

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

if (failures === 0) {
  console.log('\nTodos los tests pasaron');
} else {
  console.log(`\n${failures} test(s) fallaron`);
  process.exitCode = 1;
}
