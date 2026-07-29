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

// Cada parroquia (y las misas conjuntas) tiene su propio cancionero, su
// propia lista interna, su propio QR y su propia pantalla de proyección —
// todo separado, aunque conviven en la misma app y el mismo login del
// equipo. `key` es el identificador técnico (se usa en la base de datos y
// en la URL de la página pública); `label` es lo que se ve en pantalla.
export const SPACES = [
  { key: 'merced', label: 'Nuestra Señora de la Merced' },
  { key: 'maria-auxiliadora', label: 'María Auxiliadora' },
  { key: 'general', label: 'General (misas conjuntas)' },
];

export const DEFAULT_SPACE_KEY = SPACES[0].key;
