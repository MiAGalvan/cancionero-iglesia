// Afinador de guitarra: escucha el micrófono y detecta el tono más cercano
// por autocorrelación (ver tuner/pitchDetect.js). Todo el análisis pasa en
// el dispositivo — no se graba nada ni se manda audio a ningún lado, así
// que funciona sin conexión igual que el resto de la app.
import { detectPitch } from '../tuner/pitchDetect.js';

const STRINGS = [
  { name: 'Mi', label: '6ª (grave)', freq: 82.41 },
  { name: 'La', label: '5ª', freq: 110.0 },
  { name: 'Re', label: '4ª', freq: 146.83 },
  { name: 'Sol', label: '3ª', freq: 196.0 },
  { name: 'Si', label: '2ª', freq: 246.94 },
  { name: 'Mi', label: '1ª (aguda)', freq: 329.63 },
];

export function renderTunerView(container) {
  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Afinador</h2>
      <span></span>
    </div>
    <div class="form-view tuner-view">
      <p class="chord-editor-hint">
        Afinación estándar de guitarra (Mi La Re Sol Si Mi). Pide permiso
        del micrófono la primera vez — el análisis es todo local, no se
        graba ni se manda nada a ningún lado.
      </p>
      <div class="tuner-strings" id="tuner-strings">
        ${STRINGS.map(
          (s, i) =>
            `<button type="button" class="tuner-string-btn" data-string-index="${i}" title="${escapeAttr(
              `${s.name} — ${s.label} — ${s.freq} Hz`
            )}">${escapeHtml(s.name)}<span class="tuner-string-label">${escapeHtml(s.label)}</span></button>`
        ).join('')}
      </div>
      <div class="tuner-display" id="tuner-display">
        <div class="tuner-note" id="tuner-note">—</div>
        <div class="tuner-freq" id="tuner-freq">Tocá "Empezar" y hacé sonar una cuerda</div>
        <div class="tuner-meter">
          <div class="tuner-meter-needle" id="tuner-needle"></div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="tuner-start-btn">🎤 Empezar</button>
      </div>
      <div id="tuner-status" class="warning-box" hidden></div>
    </div>
  `;

  const noteEl = container.querySelector('#tuner-note');
  const freqEl = container.querySelector('#tuner-freq');
  const needleEl = container.querySelector('#tuner-needle');
  const startBtn = container.querySelector('#tuner-start-btn');
  const statusEl = container.querySelector('#tuner-status');
  const displayEl = container.querySelector('#tuner-display');
  const stringButtons = container.querySelectorAll('.tuner-string-btn');

  let audioContext = null;
  let analyser = null;
  let mediaStream = null;
  let intervalId = null;
  // Si tocan una cuerda puntual, comparamos siempre contra ESA nota (útil
  // para afinar una cuerda bien desafinada); si no, se detecta sola la más
  // cercana a lo que suena, como un afinador con pinza normal.
  let pinnedString = null;

  stringButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.stringIndex);
      const isSame = pinnedString === STRINGS[index];
      pinnedString = isSame ? null : STRINGS[index];
      stringButtons.forEach((b) => b.classList.toggle('active', !isSame && b === btn));
    });
  });

  function closestString(freq) {
    let best = STRINGS[0];
    let bestDiff = Infinity;
    for (const s of STRINGS) {
      const diff = Math.abs(1200 * Math.log2(freq / s.freq));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }

  function updateDisplay(freq) {
    if (freq <= 0) {
      freqEl.textContent = 'Escuchando...';
      needleEl.style.transform = 'translateX(-50%)';
      displayEl.classList.remove('in-tune', 'out-of-tune');
      return;
    }

    const target = pinnedString || closestString(freq);
    const centsOff = 1200 * Math.log2(freq / target.freq);
    const clamped = Math.max(-50, Math.min(50, centsOff));
    const pixelOffset = (clamped / 50) * 130;

    noteEl.textContent = target.name;
    freqEl.textContent = `${freq.toFixed(1)} Hz · cuerda ${target.label} (${target.freq} Hz)`;
    needleEl.style.transform = `translateX(calc(-50% + ${pixelOffset}px))`;

    const inTune = Math.abs(centsOff) < 5;
    displayEl.classList.toggle('in-tune', inTune);
    displayEl.classList.toggle('out-of-tune', !inTune);
  }

  async function start() {
    statusEl.hidden = true;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      statusEl.textContent = 'No se pudo acceder al micrófono. Revisá los permisos del navegador para esta página.';
      statusEl.hidden = false;
      return;
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    intervalId = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      updateDisplay(detectPitch(buffer, audioContext.sampleRate));
    }, 100);

    startBtn.textContent = '⏹ Detener';
    startBtn.dataset.running = 'true';
  }

  function stop() {
    if (intervalId) clearInterval(intervalId);
    if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
    if (audioContext) audioContext.close();
    intervalId = null;
    mediaStream = null;
    audioContext = null;
    startBtn.textContent = '🎤 Empezar';
    startBtn.dataset.running = 'false';
    freqEl.textContent = 'Tocá "Empezar" y hacé sonar una cuerda';
    noteEl.textContent = '—';
    needleEl.style.transform = 'translateX(-50%)';
    displayEl.classList.remove('in-tune', 'out-of-tune');
  }

  startBtn.addEventListener('click', () => {
    if (startBtn.dataset.running === 'true') stop();
    else start();
  });

  // Si se navega a otra pantalla con el afinador prendido, apagamos el
  // micrófono solos — si no, seguiría escuchando en segundo plano sin que
  // nadie lo vea, gastando batería con el ícono del micrófono prendido.
  window.addEventListener('hashchange', stop, { once: true });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
