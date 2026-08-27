// Datos fijos compartidos entre storage/db.js y storage/settings.js. Viven
// en su propio archivo (en vez de estar en cualquiera de los dos) porque
// ambos los necesitan: db.js para migrar datos viejos al espacio por
// defecto, settings.js para armar la lista completa de categorías/espacios.
// Si estuvieran en uno de los dos, el otro tendría que importarlo y se
// arma un ciclo (A importa de B, B importa de A), que rompe en tiempo de
// ejecución.

// Categorías litúrgicas: lista fija y en este orden a propósito (es el orden
// en el que se van cantando en la misa). No es editable desde la UI.
export const CATEGORIES = [
  'ENTRADA',
  'KYRIE',
  'PERDÓN',
  'ENTRADA DE LA PALABRA',
  'GLORIA',
  'ALELUYA',
  'OFERTORIO',
  'SANTO',
  'CORDERO',
  'COMUNIÓN',
  'MEDITACIÓN',
  'SALIDA',
];

// Tiempos y temas litúrgicos: a diferencia de CATEGORIES (el MOMENTO de la
// misa: Entrada, Comunión...), esto es OTRO eje, independiente — de qué
// época/tema es la canción, para poder acotar las opciones en "Lista de
// misa" según el tiempo litúrgico de esa semana. Es una lista de arranque,
// editable desde la app igual que las carpetas agregadas (ver
// storage/settings.js) — una canción puede no tener ninguna, lo que
// significa "sirve en cualquier época".
export const LITURGICAL_TAGS = [
  'Adviento',
  'Navidad',
  'Cuaresma',
  'Semana Santa',
  'Pascua',
  'Pentecostés',
  'Tiempo Ordinario',
  'Buen Pastor',
  'Eucaristía',
  'María',
  'Perdón/Reconciliación',
  'Envío/Misión',
  'Espíritu Santo',
  'Adoración',
];

// La lista de parroquias/capillas (espacios) es editable desde la app — ver
// storage/settings.js, que es donde vive de verdad (con nombre, localidad y
// provincia de cada una). Acá solo queda la key de la que se usa como
// espacio por defecto en migraciones de datos viejos, un simple string sin
// necesidad de la lista completa.
export const DEFAULT_SPACE_KEY = 'merced';
