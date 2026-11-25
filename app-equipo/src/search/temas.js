// Temas litúrgicos: el puente entre las PALABRAS de las lecturas y los TEMAS
// de las canciones (ver data/fichasCanciones.json y search/sugerencias.js).
//
// Comparar palabra contra palabra no alcanza: el Evangelio de las diez
// vírgenes habla de lámparas, aceite y esposo, y una canción sobre la
// vigilancia y la espera del Señor no repite ninguna de esas palabras. Acá cada
// tema tiene una lista de palabras que lo delatan en una lectura ("lámpara",
// "esposo", "velen" → espera), y cada canción trae en su ficha los temas de los
// que habla. Si coinciden los temas, la canción se sugiere aunque no coincidan
// las palabras.
//
// Las palabras van sin tildes y en minúscula; sugerencias.js las compara por la
// raíz (así "vigilen" y "vigilar" son lo mismo). Una palabra puede estar en más
// de un tema. Es una lista de arranque: se ajusta mirando qué sugiere en
// misas reales.

export const LEXICO_TEMAS = {
  espera: [
    'vigilar', 'vigilen', 'velen', 'velad', 'velar', 'centinela', 'despierten', 'despertad', 'lampara', 'lamparas', 'aceite',
    'esposo', 'vendra', 'vendras', 'vendran', 'venida', 'aguardar', 'aguardamos', 'esperar', 'esperamos', 'esperan', 'espera',
    'preparar', 'preparad', 'preparen', 'tarde', 'tardes', 'demora', 'redentor', 'salvador', 'mesias', 'promesa', 'promesas',
    'emmanuel', 'emanuel', 'rasgaras', 'descendieras', 'descienda', 'retorno', 'regresar', 'dueno', 'hora',
    'enderezad', 'allanad', 'consolad',
  ],
  esperanza: ['esperanza', 'esperar', 'esperan', 'confianza', 'promesa', 'promesas', 'futuro', 'amanecer', 'alba'],
  conversion: [
    'conversion', 'convertir', 'convertid', 'vuelve', 'volved', 'volver', 'regreso', 'arrepentimiento', 'arrepentios', 'penitencia',
    'perdon', 'perdona', 'perdonar', 'pecado', 'pecados', 'pecador', 'pecadores', 'culpa', 'culpas', 'purificar', 'limpiar',
    'lavar', 'renovar', 'iniquidad', 'maldad', 'enmienda', 'cambiar',
  ],
  misericordia: ['misericordia', 'misericordioso', 'compasion', 'piedad', 'consuelo', 'consolar', 'consolad', 'ternura', 'clemencia', 'curar', 'sanar'],
  confianza: ['confiar', 'confianza', 'confia', 'fiel', 'fidelidad', 'refugio', 'roca', 'fortaleza', 'amparo', 'seguro', 'temer', 'temas', 'miedo', 'protege', 'protector'],
  alabanza: ['alabar', 'alabanza', 'alabad', 'bendecid', 'bendecir', 'bendito', 'gloria', 'himno', 'cantad', 'cantemos', 'cantar', 'aleluya', 'aclamad', 'aclamar'],
  gratitud: ['gracias', 'agradecer', 'agradecimiento', 'acciondegracias'],
  alegria: ['alegria', 'alegrar', 'alegraos', 'alegrate', 'gozo', 'gozar', 'fiesta', 'jubilo', 'regocijo', 'festejar'],
  eucaristia: ['pan', 'vino', 'mesa', 'cuerpo', 'sangre', 'comer', 'comed', 'beber', 'banquete', 'cena', 'alimento', 'comida', 'hambre', 'sed', 'copa', 'cordero', 'banquetes', 'manjar'],
  entrega: ['ofrecer', 'ofrenda', 'ofrendas', 'entregar', 'entrega', 'dones', 'compartir', 'servir', 'servicio', 'sacrificio', 'donar', 'regalo'],
  pobres: ['pobre', 'pobres', 'pobreza', 'humilde', 'humildes', 'necesitado', 'necesitados', 'huerfano', 'viuda', 'oprimido', 'oprimidos', 'marginado', 'pequenos', 'mendigo'],
  justicia: ['justicia', 'justo', 'justos', 'derecho', 'libertad', 'libre', 'liberar', 'oprimir', 'opresion', 'injusticia', 'cautivos', 'esclavo'],
  paz: ['paz', 'pacifico', 'pacificos', 'concordia', 'reconciliar', 'reconciliacion'],
  unidad: ['unidad', 'unidos', 'unir', 'hermano', 'hermanos', 'hermandad', 'fraterno', 'fraternidad', 'comunidad', 'congregar', 'reunidos', 'reunir', 'pueblo', 'iglesia', 'familia', 'amistad', 'amigo', 'amigos', 'juntos'],
  amor: ['amor', 'amar', 'amad', 'amado', 'amados', 'caridad', 'amemos'],
  mision: ['enviar', 'envio', 'enviado', 'mision', 'misionero', 'anunciar', 'anunciad', 'proclamar', 'proclamad', 'testigo', 'testigos', 'testimonio', 'apostol', 'apostoles', 'vayan', 'vayais', 'evangelizar', 'predicar'],
  vocacion: ['llamar', 'llamado', 'llamada', 'vocacion', 'sigueme', 'seguir', 'seguid', 'seguimiento', 'discipulo', 'discipulos', 'elegir', 'elegido', 'escogido', 'escoger', 'dejarlo'],
  maria: ['maria', 'virgen', 'madre', 'nazaret', 'magnificat', 'anunciacion', 'gabriel', 'concebiras', 'concebir', 'hija', 'inmaculada', 'inmaculado'],
  palabra: ['palabra', 'escuchar', 'escuchad', 'escucha', 'oid', 'oye', 'voz', 'ley', 'mandamiento', 'mandamientos', 'evangelio', 'sabiduria', 'sabio', 'sabios'],
  luz: ['luz', 'lampara', 'lamparas', 'antorcha', 'brillar', 'brilla', 'resplandor', 'resplandecer', 'sol', 'estrella', 'alba', 'aurora', 'tiniebla', 'tinieblas', 'oscuridad', 'noche', 'alumbrar'],
  cruz: ['cruz', 'crucificado', 'pasion', 'sufrimiento', 'sufrir', 'llagas', 'dolor', 'muerte', 'calvario'],
  pascua: ['pascua', 'resucitar', 'resucito', 'resurreccion', 'vencer', 'vencio', 'victoria'],
  camino: ['camino', 'caminar', 'caminante', 'senda', 'peregrino', 'peregrinos', 'desierto', 'marcha', 'ruta', 'jornada', 'sendero', 'peregrinar'],
  creacion: ['creacion', 'creador', 'creatura', 'creaturas', 'tierra', 'mar', 'montanas', 'universo', 'semilla', 'sembrador', 'siembra', 'trigo', 'espiga', 'vina', 'fruto', 'frutos', 'cosecha'],
  reino: ['reino', 'reinar', 'rey', 'reina', 'trono', 'senorio'],
  vida: ['vida', 'vivir', 'vivo', 'viviente', 'vivificar'],
  silencio: ['silencio', 'callad', 'callar', 'recogimiento', 'quietud'],
  juventud: ['joven', 'jovenes', 'juventud', 'nino', 'ninos', 'infancia'],
  difuntos: ['difunto', 'difuntos', 'descanso', 'paraiso'],
};

// Las etiquetas de las fichas se escribieron a mano y hay muchas formas de
// decir lo mismo ("venida-del-senor", "retorno", "vigilancia"). Acá se
// llevan a los temas de arriba; lo que no esté en esta lista se usa tal cual.
const SINONIMOS = {
  espera: ['venida-del-senor', 'venida', 'vigilancia', 'retorno', 'deseo', 'encuentro-con-el-senor', 'anhelo-de-dios', 'sed-de-dios', 'busqueda-de-dios', 'visita', 'promesas', 'emmanuel', 'salvador', 'redentor', 'mesias', 'estrella', 'preparar-camino', 'posada'],
  esperanza: ['optimismo', 'ciudad-eterna'],
  conversion: ['perdon', 'vida-nueva', 'piedad', 'alfarero', 'pureza', 'salvacion'],
  misericordia: ['consuelo', 'ternura', 'sanacion', 'amor-de-dios'],
  confianza: ['fe', 'fidelidad', 'providencia', 'cercania', 'disponibilidad'],
  alabanza: ['aleluya', 'trinidad', 'uncion', 'adoracion', 'bendicion'],
  alegria: ['fiesta-mariana', 'procesion'],
  eucaristia: ['pan', 'vino', 'mesa', 'pan-de-vida', 'fraccion-del-pan', 'quedate', 'grano-de-trigo', 'frutos'],
  entrega: ['ofrenda', 'ofrenda-vida', 'vida-ofrecida', 'compartir', 'servicio', 'trabajo'],
  pobres: ['pobreza'],
  justicia: ['libertad', 'solidaridad', 'martires', 'bienaventuranzas'],
  unidad: ['reunion', 'fraternidad', 'amistad', 'pueblo', 'iglesia', 'iglesia-en-marcha', 'familia', 'comunidad', 'casa-de-dios'],
  amor: ['mandamiento-nuevo'],
  mision: ['envio', 'testigos', 'testimonio', 'apostol', 'profeta'],
  vocacion: ['seguimiento', 'si'],
  maria: ['anunciacion', 'inmaculada', 'asuncion', 'magnificat', 'fiesta-mariana', 'reina', 'auxilio', 'merced', 'cana', 'jose'],
  palabra: ['escucha'],
  luz: ['noche'],
  cruz: ['pasion', 'sentido-del-dolor'],
  pascua: ['resurreccion'],
  camino: ['peregrino', 'peregrinos', 'desierto', 'jerusalen'],
  creacion: [],
  reino: ['reino-cerca'],
  vida: ['vida-eterna'],
  silencio: ['presencia'],
  juventud: ['ninos'],
  navidad: ['nacimiento'],
};

const CANONICO = new Map();
for (const [tema, formas] of Object.entries(SINONIMOS)) {
  for (const forma of formas) CANONICO.set(forma, tema);
}

export function temaCanonico(tema) {
  return CANONICO.get(tema) || tema;
}
