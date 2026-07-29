// Tests simples, sin librería: cada caso llama al parser y compara contra el
// resultado esperado. Correr con: node src/parser/chordProParser.test.js
import { pastedTextToChordPro, isChordToken } from './chordProParser.js';

let failures = 0;

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.log(`FAIL: ${label}`);
    console.log(`  esperado: ${JSON.stringify(expected)}`);
    console.log(`  obtenido: ${JSON.stringify(actual)}`);
  }
}

// --- isChordToken: casos sueltos ---
assertEqual(isChordToken('Am'), true, 'Am es acorde');
assertEqual(isChordToken('E7'), true, 'E7 es acorde');
assertEqual(isChordToken('C#m'), true, 'C#m es acorde');
assertEqual(isChordToken('Bb'), true, 'Bb es acorde');
assertEqual(isChordToken('Dsus4'), true, 'Dsus4 es acorde');
assertEqual(isChordToken('F#m7'), true, 'F#m7 es acorde');
assertEqual(isChordToken('Amor'), false, '"Amor" no es acorde');
assertEqual(isChordToken('La'), false, '"La" no es acorde');
assertEqual(isChordToken('MIm'), true, 'MIm (notación latina) es acorde');
assertEqual(isChordToken('SOL7'), true, 'SOL7 (notación latina) es acorde');

// --- Ejemplo 1: zamba, acordes alineados arriba de la letra ---
const zambaInput =
  '   Am          E7        Am\n' +
  'Zamba de la triste esperanza\n' +
  '      Dm            E7      Am\n' +
  'que viene desde el ayer';

const zambaExpected =
  'Zam[Am]ba de la tri[E7]ste espera[Am]nza\n' +
  'que vi[Dm]ene desde el a[E7]yer[Am]';

assertEqual(pastedTextToChordPro(zambaInput), zambaExpected, 'zamba: acordes insertados en su columna');

// --- Ejemplo 2: chacarera, con línea de acordes suelta (intro) ---
const chacareraInput =
  'Am  E7  Dm  G7\n\n' +
  'C          G7           C\n' +
  'Tonada de la chacarera\n' +
  '   F           C\n' +
  'que canta mi corazón';

const chacareraExpected =
  '[Am] [E7] [Dm] [G7]\n\n' +
  '[C]Tonada de l[G7]a chacarera[C]\n' +
  'que[F] canta mi co[C]razón';

assertEqual(
  pastedTextToChordPro(chacareraInput),
  chacareraExpected,
  'chacarera: línea de intro sin letra + verso con acordes'
);

// --- Ejemplo 3: zamba real en notación latina (Do Re Mi Fa Sol La Si), tal
// cual viene copiada de sitios de cancioneros en español, en mayúsculas.
// chordsheetjs solo transpone estas notas si están en "Type Case" (Mim, no
// MIM), por eso el parser las normaliza al insertar el acorde.
const zambaLatinaInput =
  'MIm       SI7  MIm MI7\n' +
  'Sangre  del ceibal\n' +
  '\n' +
  'LAm      MI7   LAm\n' +
  'que se vuelve flor';

const zambaLatinaExpected =
  '[Mim]Sangre  de[Si7]l cei[Mim]bal[Mi7]\n' +
  '\n' +
  '[Lam]que se vu[Mi7]elve f[Lam]lor';

assertEqual(
  pastedTextToChordPro(zambaLatinaInput),
  zambaLatinaExpected,
  'zamba en notación latina: acordes normalizados a Type Case'
);

// --- Ejemplo 4: "BIS" (repetir) mezclado en una línea de acordes no debe
// romper la detección ni insertarse como si fuera un acorde ---
const bisInput = 'MI7 LAm MIm BIS\nque es llovizna azul';
const bisExpected = '[Mi7]que [Lam]es l[Mim]lovizna azul';
assertEqual(pastedTextToChordPro(bisInput), bisExpected, '"BIS" en línea de acordes se ignora');

// --- Ejemplo 5: texto que YA viene en ChordPro (no se debe reprocesar) ---
const alreadyChordPro = '[Am]Zamba de a[E7]bril\n[Dm]bajo la [G7]luna [C]de miel';
assertEqual(
  pastedTextToChordPro(alreadyChordPro),
  alreadyChordPro,
  'texto ya en ChordPro se devuelve sin cambios'
);

if (failures > 0) {
  console.log(`\n${failures} test(s) fallaron`);
  process.exit(1);
} else {
  console.log('\nTodos los tests pasaron');
}
