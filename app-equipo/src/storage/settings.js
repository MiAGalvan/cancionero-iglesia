// Configuración simple que el equipo puede cambiar desde la app: carpetas
// (categorías) extra además de las 12 litúrgicas fijas, y el título que se
// muestra arriba del todo en la biblioteca. Se guarda en localStorage (no
// hace falta IndexedDB para esto: son un par de valores chiquitos, no el
// cancionero entero), así que también funciona 100% sin conexión.
import { CATEGORIES } from './db.js';

const CUSTOM_CATEGORIES_KEY = 'cancionero-iglesia:custom-categories';
const HEADER_TITLE_KEY = 'cancionero-iglesia:header-title';

export const DEFAULT_HEADER_TITLE = 'Cancionero';

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
