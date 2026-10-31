// Tests simples, sin librería: cada caso llama a las funciones y compara
// contra el resultado esperado. Correr con: node src/editor/chordProBuilder.test.js
import {
  tokenizeWords,
  buildEditorLines,
  chordProToEditorLines,
  editorLinesToChordPro,
  normalizeTypedChord,
  clampChordIndex,
  preserveChords,
} from './chordProBuilder.js';

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

// --- tokenizeWords ---
assertEqual(
  tokenizeWords('Perdón oh Dios'),
  [
    { start: 0, text: 'Perdón' },
    { start: 7, text: 'oh' },
    { start: 10, text: 'Dios' },
  ],
  'tokenizeWords separa palabras con su posición'
);

// --- buildEditorLines: letra nueva sin acordes ---
const nuevas = buildEditorLines('Perdón oh Dios\n\nte pido con humildad');
assertEqual(nuevas.length, 3, 'buildEditorLines: 3 líneas (letra, en blanco, letra)');
assertEqual(nuevas[0].type, 'lyric', 'línea 1 es de letra');
assertEqual(nuevas[1].type, 'instrumental', 'línea en blanco es instrumental');
assertEqual(nuevas[1].chords, [], 'línea instrumental nueva arranca sin acordes');
assertEqual(nuevas[0].chords, [], 'línea de letra nueva arranca sin acordes');

// --- editorLinesToChordPro: acordes al principio de una palabra (el caso
// más común) ---
const conAcordes = buildEditorLines('Perdón oh Dios');
conAcordes[0].chords.push({ index: 0, chord: 'Am' }); // "Perdón"
conAcordes[0].chords.push({ index: 7, chord: 'E7' }); // "oh"
assertEqual(
  editorLinesToChordPro(conAcordes),
  '[Am]Perdón [E7]oh Dios',
  'editorLinesToChordPro inserta los acordes antes de la letra correcta'
);

// --- editorLinesToChordPro: acorde a mitad de una palabra ---
const conMedio = buildEditorLines('Perdón oh Dios');
conMedio[0].chords.push({ index: 2, chord: 'Am' }); // "Pe[Am]rdón"
assertEqual(
  editorLinesToChordPro(conMedio),
  'Pe[Am]rdón oh Dios',
  'un acorde a mitad de palabra se inserta en el medio, no al principio'
);

// --- varios acordes en la MISMA palabra (antes imposible: uno por palabra),
// puestos en cualquier orden ---
const dosEnUnaPalabra = buildEditorLines('Aleluya');
dosEnUnaPalabra[0].chords.push({ index: 4, chord: 'G' }, { index: 0, chord: 'C' });
assertEqual(
  editorLinesToChordPro(dosEnUnaPalabra),
  '[C]Alel[G]uya',
  'dos acordes en la misma palabra se ordenan por posición y quedan cada uno en su letra'
);

// --- un acorde después de la última palabra (index === largo del texto) ---
const alFinal = buildEditorLines('Dios');
alFinal[0].chords.push({ index: 4, chord: 'Am' });
assertEqual(editorLinesToChordPro(alFinal), 'Dios[Am]', 'un acorde al final de la línea queda después de la última letra');

// --- instrumental: varios acordes sueltos ---
const instrumental = buildEditorLines('');
instrumental[0].chords.push('Am', 'E7');
assertEqual(
  editorLinesToChordPro(instrumental),
  '[Am] [E7]',
  'línea instrumental junta los acordes sueltos'
);

// --- chordProToEditorLines: cargar una canción ya guardada ---
const cargada = chordProToEditorLines('[Am]Perdón [E7]oh Dios\n[Am] [E7]');
assertEqual(cargada[0].type, 'lyric', 'primera línea cargada es de letra');
assertEqual(cargada[0].chords, [{ index: 0, chord: 'Am' }, { index: 7, chord: 'E7' }], 'los acordes cargados quedan en la letra donde estaban');
assertEqual(cargada[1].type, 'instrumental', 'segunda línea cargada es instrumental');
assertEqual(cargada[1].chords, ['Am', 'E7'], 'acordes sueltos de la línea instrumental se recuperan en orden');

// --- ida y vuelta: cargar y volver a generar da siempre el mismo ChordPro,
// incluso con un acorde a mitad de palabra (el offset guarda la posición
// exacta, no se pierde) ---
const original = '[Am]Perdón [E7]oh Dios, mi Pa[Am]dre y Señor';
assertEqual(
  editorLinesToChordPro(chordProToEditorLines(original)),
  original,
  'cargar una canción y reconstruirla sin tocar nada da el mismo texto, acordes a mitad de palabra incluidos'
);

// --- acorde a mitad de palabra: se carga en esa letra exacta ---
const mitadDePalabra = chordProToEditorLines('a[E7]bril');
assertEqual(mitadDePalabra[0].chords, [{ index: 1, chord: 'E7' }], 'acorde a mitad de palabra se carga en su letra');

// --- ida y vuelta con varios acordes en una palabra y uno al final: antes
// se perdían (uno por palabra, el final se corría una letra) ---
const variosYFinal = '[C]Alel[G]uya[Am]';
assertEqual(
  editorLinesToChordPro(chordProToEditorLines(variosYFinal)),
  variosYFinal,
  'ida y vuelta conserva dos acordes en la misma palabra y uno al final de la línea'
);

// --- espacios de más en la letra original: los acordes siguen en su letra
// aunque el editor colapse los espacios ---
assertEqual(
  chordProToEditorLines('Perdón   [E7]oh')[0].chords,
  [{ index: 7, chord: 'E7' }],
  'un acorde después de espacios de más pasa al principio de la palabra que sigue'
);

// --- directiva suelta: se ignora, no rompe nada ---
const conDirectiva = chordProToEditorLines('{title: Perdón}\n[Am]Perdón oh Dios');
assertEqual(conDirectiva.length, 1, 'línea de directiva se descarta al cargar');

// --- clampChordIndex: nunca deja salirse del texto de la línea ---
assertEqual(clampChordIndex(-3, 10), 0, 'clampChordIndex no deja ir antes del principio');
assertEqual(clampChordIndex(4, 10), 4, 'clampChordIndex: una posición válida se mantiene');
assertEqual(clampChordIndex(10, 10), 10, 'clampChordIndex permite el final de la línea');
assertEqual(clampChordIndex(99, 10), 10, 'clampChordIndex recorta valores grandes al final');

// --- normalizeTypedChord ---
assertEqual(normalizeTypedChord('  Am  '), 'Am', 'normalizeTypedChord recorta espacios');
assertEqual(normalizeTypedChord('SOL7'), 'Sol7', 'normalizeTypedChord normaliza notación latina');
assertEqual(normalizeTypedChord('   '), '', 'normalizeTypedChord vacío = sacar el acorde');
assertEqual(normalizeTypedChord('am'), 'Am', 'normalizeTypedChord pone en mayúscula la nota anglosajona tipeada en minúscula');
assertEqual(normalizeTypedChord('e7'), 'E7', 'normalizeTypedChord: "e7" -> "E7"');
assertEqual(normalizeTypedChord('am/c'), 'Am/C', 'normalizeTypedChord pone en mayúscula también la nota del bajo');

// --- preserveChords: sacar una línea en blanco de más no debe perder los
// acordes de las líneas que vienen después (el bug reportado: "edité letra
// para sacar un interlineado de más y se borraron los acordes") ---
const conAcordesYBlanco = chordProToEditorLines('[Am]Perdón oh Dios\n\n\n[E7]te pido con humildad');
const sacandoUnaLineaEnBlanco = buildEditorLines('Perdón oh Dios\n\nte pido con humildad');
const resultadoSinBlanco = preserveChords(sacandoUnaLineaEnBlanco, conAcordesYBlanco);
assertEqual(
  resultadoSinBlanco[2].chords,
  [{ index: 0, chord: 'E7' }],
  'preserveChords: sacar una línea en blanco de más no pierde el acorde de la línea siguiente'
);

// --- preserveChords: agregar una línea en blanco de más tampoco debe
// perder los acordes de lo que viene después ---
const conUnBlanco = chordProToEditorLines('[Am]Perdón oh Dios\n\n[E7]te pido con humildad');
const agregandoUnaLineaEnBlanco = buildEditorLines('Perdón oh Dios\n\n\nte pido con humildad');
const resultadoConBlancoDeMas = preserveChords(agregandoUnaLineaEnBlanco, conUnBlanco);
assertEqual(
  resultadoConBlancoDeMas[3].chords,
  [{ index: 0, chord: 'E7' }],
  'preserveChords: agregar una línea en blanco de más no pierde el acorde de la línea siguiente'
);

// --- preserveChords: editar el texto de una línea sí pierde el acorde de
// ESA línea puntual (es lo esperable, ya no hay forma de saber dónde iba),
// pero no toca a las demás ---
const conDosLineas = chordProToEditorLines('[Am]Perdón oh Dios\n[E7]te pido con humildad');
const editandoLaPrimera = buildEditorLines('Perdón oh Dios y Padre\nte pido con humildad');
const resultadoEditado = preserveChords(editandoLaPrimera, conDosLineas);
assertEqual(resultadoEditado[0].chords, [], 'preserveChords: la línea reescrita pierde su acorde (no hay forma de saber dónde iba)');
assertEqual(
  resultadoEditado[1].chords,
  [{ index: 0, chord: 'E7' }],
  'preserveChords: la línea que no cambió mantiene su acorde aunque otra arriba se haya reescrito'
);

// --- preserveChords: un estribillo repetido (misma letra dos veces) no
// mezcla los acordes entre ambas apariciones al no cambiar nada ---
const conEstribilloRepetido = chordProToEditorLines('[C]Aleluya\n[G]Gloria\n[C]Aleluya');
const mismoTextoSinCambios = buildEditorLines('Aleluya\nGloria\nAleluya');
const resultadoEstribillo = preserveChords(mismoTextoSinCambios, conEstribilloRepetido);
assertEqual(resultadoEstribillo[0].chords, [{ index: 0, chord: 'C' }], 'preserveChords: primera aparición del estribillo repetido mantiene su acorde');
assertEqual(resultadoEstribillo[2].chords, [{ index: 0, chord: 'C' }], 'preserveChords: segunda aparición del estribillo repetido también mantiene su acorde');

if (failures === 0) {
  console.log('\nTodos los tests pasaron');
} else {
  console.log(`\n${failures} test(s) fallaron`);
  process.exitCode = 1;
}
