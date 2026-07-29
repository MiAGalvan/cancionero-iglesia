// Diagramas de guitarra usando vexchords (dibujo) + @tombatossals/chords-db
// (base de datos real de digitaciones, verificada, con varias posiciones
// por acorde — no las inventamos a mano).
import { ChordBox } from 'vexchords';
import guitarChords from '@tombatossals/chords-db/lib/guitar.json';
import { parseChordName } from './chordTheory.js';

// chords-db numera las cuerdas de grave a aguda (índice 0 = Mi grave), y
// vexchords al revés (cuerda 1 = Mi agudo). "frets" ya viene en números
// relativos al traste base (ver "position"), así que se usan tal cual.
function positionToVexchords(position) {
  const chord = position.frets.map((fret, i) => {
    const string = 6 - i;
    return fret === -1 ? [string, 'x'] : [string, fret];
  });

  const barres = (position.barres || []).map((fretRelative) => {
    const stringIndexes = position.frets
      .map((fret, i) => (fret === fretRelative ? i : null))
      .filter((i) => i !== null);
    return {
      fromString: 6 - Math.min(...stringIndexes),
      toString: 6 - Math.max(...stringIndexes),
      fret: fretRelative,
    };
  });

  return { chord, barres, position: position.baseFret };
}

// Devuelve todas las posiciones/digitaciones conocidas para un acorde, ya
// convertidas al formato que entiende vexchords. Array vacío si no se
// reconoce el acorde o no hay datos para esa calidad.
export function getGuitarVoicings(chordName) {
  const parsed = parseChordName(chordName);
  if (!parsed) return [];

  const entries = guitarChords.chords[parsed.key];
  if (!entries) return [];

  const entry = entries.find((e) => e.suffix === parsed.suffix);
  if (!entry) return [];

  return entry.positions.map(positionToVexchords);
}

// Dibuja una posición puntual (una de las que devuelve getGuitarVoicings)
// dentro de un contenedor, reemplazando lo que hubiera antes.
export function drawGuitarVoicing(container, voicing) {
  container.innerHTML = '';
  const target = document.createElement('div');
  target.id = `guitar-diagram-${Math.random().toString(36).slice(2)}`;
  container.appendChild(target);

  const box = new ChordBox(`#${target.id}`, {
    width: 160,
    height: 190,
    defaultColor: '#e8dfce',
    bgColor: 'transparent',
  });
  box.draw(voicing);
}
