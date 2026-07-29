// Reconoce el texto de una foto (letra escrita en un papel, fotografiada
// con el celular) usando Tesseract.js — corre ENTERO en el navegador, la
// foto nunca se manda a ningún servidor. La primera vez que se usa necesita
// internet para bajar el "motor" de reconocimiento (unos pocos MB); después
// queda guardado en el propio navegador (IndexedDB, lo maneja Tesseract.js
// solo) y las próximas veces puede andar sin conexión.
import { createWorker } from 'tesseract.js';

// Reutilizamos el mismo worker entre varias fotos en la misma sesión, en
// vez de crear uno nuevo cada vez (crear uno es la parte lenta).
let workerPromise = null;

function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('spa', 1, {
      logger: onProgress,
    });
  }
  return workerPromise;
}

// `imageFile` es el File que sale de un <input type="file">. Devuelve el
// texto reconocido tal cual (sin ningún procesamiento); el usuario lo revisa
// y corrige antes de convertirlo a ChordPro, como con cualquier letra pegada.
export async function recognizeTextFromImage(imageFile, { onProgress } = {}) {
  const worker = await getWorker(onProgress);
  const {
    data: { text },
  } = await worker.recognize(imageFile);
  return text.trim();
}
