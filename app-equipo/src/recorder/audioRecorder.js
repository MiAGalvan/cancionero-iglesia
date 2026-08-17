// Graba audio del micrófono con la API MediaRecorder del navegador — nada
// de librerías externas, mismo espíritu que el afinador. Se graba en Opus a
// un bitrate bajo a propósito: es una referencia de cómo se canta la
// canción, no una grabación de estudio, y así ocupa mucho menos espacio en
// el almacenamiento gratis de Supabase.
const AUDIO_BITS_PER_SECOND = 32000;

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

export function createAudioRecorder() {
  let stream = null;
  let recorder = null;
  let chunks = [];

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    chunks = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.start();
  }

  // Devuelve el audio grabado como Blob. Corta el micrófono apenas termina
  // de grabar (no lo deja abierto en segundo plano).
  function stop() {
    return new Promise((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        },
        { once: true }
      );
      recorder.stop();
    });
  }

  function isRecording() {
    return recorder?.state === 'recording';
  }

  return { start, stop, isRecording };
}
