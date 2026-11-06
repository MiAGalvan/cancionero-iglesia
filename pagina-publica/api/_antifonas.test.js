// Correr con: node api/_antifonas.test.js
const { extraerAntifonas } = require('./_antifonas.js');

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

// Recorte del HTML real de eucaristiadiaria.cl (domingo 11/10/2026).
const html = `
<p>&nbsp;</p>
<p style="text-align:justify"><span style="color:rgb(0, 0, 0)"><span style="color:rgb(255, 0, 0)">Ant&iacute;fona de entrada Sal 129, 3-4</span></span></p>
<p style="text-align:justify"><span style="color:rgb(0, 0, 0)">Si tienes en cuenta las culpas, Se&ntilde;or, &iquest;qui&eacute;n podr&aacute; subsistir? Dios de Israel, en ti se encuentra el perd&oacute;n.</span></p>
<p><span style="color:rgb(255, 0, 0)">Gloria</span></p>
<p><span>ORACI&Oacute;N COLECTA</span></p>
<p>Dios todopoderoso.</p>
<p><span style="color:rgb(255, 0, 0)">Ant&iacute;fona de comuni&oacute;n Cf. Sal 33, 11</span></p>
<p>Los ricos se empobrecen y sufren hambre, pero los que buscan al Se&ntilde;or no carecen de nada.</p>
<p><span style="color:rgb(255, 0, 0)">O bien: </span>1 Jn 3,2</p>
<p>Cuando se manifieste el Se&ntilde;or, seremos semejantes a &eacute;l, porque lo veremos tal cual es.</p>
<p><span>ORACI&Oacute;N DESPU&Eacute;S DE LA COMUNI&Oacute;N</span></p>
<p>Padre, humildemente te pedimos.</p>
<p>Palabra de Dios.</p>
<p><span>SALMO RESPONSORIAL 22, 1-6</span></p>
<p>R. El Se&ntilde;or nos prepara una mesa.</p>
<p>El Se&ntilde;or es mi pastor, nada me puede faltar. R.</p>
<p>Me gu&iacute;a por el recto sendero. R.</p>
<p>&nbsp;</p>
<p>Lo puedo todo en Aquel que me conforta&aacute;</p>
<p>Lectura de la carta del Ap&oacute;stol san Pablo.</p>
`;

const r = extraerAntifonas(html);
assertEqual(r.entrada.referencia, 'Sal 129, 3-4', 'entrada: la cita se separa del título');
assertEqual(
  r.entrada.texto,
  'Si tienes en cuenta las culpas, Señor, ¿quién podrá subsistir? Dios de Israel, en ti se encuentra el perdón.',
  'entrada: texto completo con acentos y signos, sin pasar al Gloria ni a la colecta'
);
assertEqual(r.comunion.referencia, 'Cf. Sal 33, 11', 'comunión: la cita se separa del título');
assertEqual(
  r.comunion.texto,
  'Los ricos se empobrecen y sufren hambre, pero los que buscan al Señor no carecen de nada.\n\nO bien: 1 Jn 3,2\n\nCuando se manifieste el Señor, seremos semejantes a él, porque lo veremos tal cual es.',
  'comunión: incluye la opción "O bien" y corta antes de la oración después de la comunión'
);

assertEqual(r.salmo.referencia, '22, 1-6', 'salmo: la cita se separa del título');
assertEqual(r.salmo.respuesta, 'El Señor nos prepara una mesa.', 'salmo: se extrae la respuesta');
assertEqual(
  r.salmo.texto,
  'R. El Señor nos prepara una mesa.\n\nEl Señor es mi pastor, nada me puede faltar. R.\n\nMe guía por el recto sendero. R.',
  'salmo: respuesta primero y cada estrofa con su "R.", cortando antes del título de la 2ª lectura'
);
assertEqual(
  extraerAntifonas('<p>SALMO RESPONSORIAL 1</p><p>Estrofa sin respuesta.</p>'),
  null,
  'salmo sin línea de respuesta ("R. ...") no se inventa'
);

assertEqual(extraerAntifonas('<p>Otra cosa</p>'), null, 'sin antífonas devuelve null');
assertEqual(
  extraerAntifonas('<p>Antífona de entrada Sal 1</p><p>Texto.</p><p>Gloria</p>').comunion,
  null,
  'si falta una de las dos, esa queda en null y la otra se conserva'
);

if (failures === 0) {
  console.log('\nTodos los tests pasaron');
} else {
  console.log(`\n${failures} test(s) fallaron`);
  process.exitCode = 1;
}
