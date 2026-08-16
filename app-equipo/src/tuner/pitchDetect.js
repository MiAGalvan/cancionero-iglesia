// Detecta la frecuencia fundamental (el "tono") de un pedazo de audio, para
// el afinador de guitarra. Usa autocorrelación: es la técnica clásica y
// simple para esto (compara la señal contra copias corridas de sí misma —
// donde más se parecen marca el período de la onda, y de ahí sale la
// frecuencia). No hace falta ninguna librería externa ni mandar el audio a
// ningún lado, todo el cálculo es local.
//
// `buffer` es un Float32Array con muestras de audio en el rango -1..1
// (lo que da AnalyserNode.getFloatTimeDomainData). Devuelve la frecuencia en
// Hz, o -1 si no hay suficiente señal como para confiar en el resultado
// (silencio, o ruido sin un tono claro).
export function detectPitch(buffer, sampleRate) {
  const size = buffer.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1; // demasiado flojo/silencio, no vale la pena analizar

  // Recorta los bordes silenciosos del pedazo grabado, para que no le
  // agreguen ruido a la autocorrelación.
  const threshold = 0.2;
  let start = 0;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) >= threshold) {
      start = i;
      break;
    }
  }
  let end = size - 1;
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) >= threshold) {
      end = size - i;
      break;
    }
  }
  const trimmed = buffer.slice(start, end);
  const trimmedSize = trimmed.length;
  if (trimmedSize < 2) return -1;

  const correlations = new Array(trimmedSize).fill(0);
  for (let lag = 0; lag < trimmedSize; lag++) {
    let sum = 0;
    for (let i = 0; i < trimmedSize - lag; i++) {
      sum += trimmed[i] * trimmed[i + lag];
    }
    correlations[lag] = sum;
  }

  // El primer "valle" antes de que la correlación vuelva a subir marca
  // dónde empieza a tener sentido buscar el pico real (lag 0 siempre es el
  // máximo absoluto porque es la señal contra sí misma sin desfasar).
  let lag = 0;
  while (lag < trimmedSize - 1 && correlations[lag] > correlations[lag + 1]) lag++;

  let bestLag = -1;
  let bestValue = -Infinity;
  for (let i = lag; i < trimmedSize; i++) {
    if (correlations[i] > bestValue) {
      bestValue = correlations[i];
      bestLag = i;
    }
  }
  if (bestLag <= 0) return -1;

  // Interpolación parabólica: afina la posición del pico entre muestras
  // vecinas, para no quedar limitados a la resolución de una sola muestra.
  const prev = correlations[bestLag - 1] ?? correlations[bestLag];
  const curr = correlations[bestLag];
  const next = correlations[bestLag + 1] ?? correlations[bestLag];
  const denominator = 2 * (2 * curr - prev - next);
  const refinedLag = denominator !== 0 ? bestLag + (next - prev) / denominator : bestLag;

  return refinedLag > 0 ? sampleRate / refinedLag : -1;
}
