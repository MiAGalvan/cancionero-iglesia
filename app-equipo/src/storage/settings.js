// Configuración simple que el equipo puede cambiar desde la app: carpetas
// (categorías) extra además de las 12 litúrgicas fijas, el título que se
// muestra arriba del todo en la biblioteca, y en qué "espacio" (parroquia)
// se está trabajando ahora mismo. Se guarda en localStorage (no hace falta
// IndexedDB para esto: son valores chiquitos, no el cancionero entero), así
// que también funciona 100% sin conexión.
import { CATEGORIES, SPACES } from './constants.js';

const CUSTOM_CATEGORIES_KEY = 'cancionero-iglesia:custom-categories';
const HEADER_TITLE_KEY = 'cancionero-iglesia:header-title';
const CURRENT_SPACE_KEY = 'cancionero-iglesia:current-space';
// Ojo: esta misma clave está repetida "a mano" en index.html, en un script
// que corre antes de que este archivo exista (para elegir el tema sin que
// se vea un parpadeo al cargar la página) — si la cambiás acá, cambiala ahí también.
const THEME_KEY = 'cancionero-iglesia:theme';

export const DEFAULT_HEADER_TITLE = 'Cancionero';

export { SPACES };

// null = "seguir el tema del sistema operativo/navegador", no una elección
// explícita. Solo 'light' o 'dark' cuenta como elegido a mano.
export function getStoredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

export function setStoredTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    localStorage.setItem(THEME_KEY, theme);
  } else {
    localStorage.removeItem(THEME_KEY);
  }
}

export function getEffectiveTheme() {
  return getStoredTheme() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function getCurrentSpaceKey() {
  const saved = localStorage.getItem(CURRENT_SPACE_KEY);
  return SPACES.some((space) => space.key === saved) ? saved : SPACES[0].key;
}

export function setCurrentSpaceKey(key) {
  if (!SPACES.some((space) => space.key === key)) return;
  localStorage.setItem(CURRENT_SPACE_KEY, key);
}

export function getSpaceLabel(key) {
  return SPACES.find((space) => space.key === key)?.label || key;
}

export function getCustomCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(categories) {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
}

// Las 12 litúrgicas fijas primero (siempre en su orden), y después las
// carpetas que el equipo fue agregando. Es la lista que hay que usar en
// cualquier lugar de la app que necesite "todas las carpetas", en vez de
// CATEGORIES (que son solo las 12 fijas, sin las agregadas).
export function getAllCategories() {
  return [...CATEGORIES, ...getCustomCategories()];
}

export function isCustomCategory(name) {
  return !CATEGORIES.includes(name);
}

// Agrega una carpeta nueva. Devuelve la lista de categorías actualizada (12
// fijas + custom). Ignora nombres vacíos o repetidos (sin importar
// mayúsculas/minúsculas), tanto contra las fijas como contra otras carpetas
// ya agregadas.
export function addCustomCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return getAllCategories();

  const existingNames = getAllCategories().map((c) => c.toLowerCase());
  if (existingNames.includes(trimmed.toLowerCase())) return getAllCategories();

  saveCustomCategories([...getCustomCategories(), trimmed]);
  return getAllCategories();
}

export function deleteCustomCategory(name) {
  saveCustomCategories(getCustomCategories().filter((c) => c !== name));
  return getAllCategories();
}

export function getHeaderTitle() {
  return localStorage.getItem(HEADER_TITLE_KEY) || DEFAULT_HEADER_TITLE;
}

export function setHeaderTitle(title) {
  const trimmed = title.trim();
  localStorage.setItem(HEADER_TITLE_KEY, trimmed || DEFAULT_HEADER_TITLE);
}
