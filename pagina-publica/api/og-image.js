// Genera al vuelo la imagen que se ve al compartir el link en WhatsApp/
// Facebook/Instagram — con el color y el nombre de la parroquia/capilla,
// para que se note de qué lugar es de un vistazo (antes era siempre la
// misma imagen genérica para todas). share-meta.js apunta acá desde
// og:image, pasando ?space=... — así cada link comparte una imagen propia
// sin que haga falta generarla ni subirla a mano.
//
// Corre en el Edge Runtime (no Node normal) porque así lo pide @vercel/og
// — la única dependencia nueva de este proyecto, que hasta ahora no
// necesitaba instalar nada. No se usa JSX (el proyecto no tiene paso de
// build/transpilación): se arma el árbol de elementos a mano con h(), del
// mismo modo en que lo haría un JSX ya compilado.
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://mfmlbykzraejkcrdkjpw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mbWxieWt6cmFlamtjcmRranB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMDUyMTAsImV4cCI6MjEwMDY4MTIxMH0.qb8QMD6zEy-Pk182-Q0qKa_EVwIMQTEw6KYiJhm77SM';

const COLOR_DEFECTO = '#2f8a7a'; // el verde azulado de siempre de la app, si la parroquia no eligió color

function h(type, props, children) {
  return { type, props: { ...props, children } };
}

// Oscurece un color hex un poco, para el degradé de fondo — un solo tono
// plano quedaba muy chato en una imagen tan grande.
function oscurecer(hex, factor) {
  const limpio = hex.replace('#', '');
  const r = parseInt(limpio.substring(0, 2), 16);
  const g = parseInt(limpio.substring(2, 4), 16);
  const b = parseInt(limpio.substring(4, 6), 16);
  const ajustar = (v) => Math.max(0, Math.round(v * factor));
  return `rgb(${ajustar(r)}, ${ajustar(g)}, ${ajustar(b)})`;
}

async function buscarParroquia(spaceKey) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/spaces?key=eq.${encodeURIComponent(spaceKey)}&select=label,locality,color`;
    const resp = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const spaceKey = searchParams.get('space') || 'merced';
  const parroquia = await buscarParroquia(spaceKey);

  const color = (parroquia?.color && parroquia.color.trim()) || COLOR_DEFECTO;
  const colorOscuro = oscurecer(color, 0.55);
  const nombre = parroquia
    ? parroquia.locality
      ? `${parroquia.label} — ${parroquia.locality}`
      : parroquia.label
    : null;

  return new ImageResponse(
    h(
      'div',
      {
        style: {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${colorOscuro} 0%, ${color} 100%)`,
          fontFamily: 'sans-serif',
        },
      },
      [
        h(
          'div',
          {
            style: {
              fontSize: 76,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: -1,
            },
          },
          'Rezar Cantando'
        ),
        h(
          'div',
          {
            style: {
              width: 180,
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.55)',
              margin: '28px 0',
              display: 'flex',
            },
          },
          []
        ),
        h(
          'div',
          {
            style: {
              fontSize: nombre ? 42 : 34,
              fontWeight: 600,
              color: '#ffffff',
              textAlign: 'center',
              maxWidth: 960,
              padding: '0 40px',
              display: 'flex',
            },
          },
          nombre || 'Lecturas de la misa'
        ),
        h(
          'div',
          {
            style: {
              fontSize: 26,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.85)',
              marginTop: 36,
              display: 'flex',
            },
          },
          '"Cantar y tocar es rezar"'
        ),
      ]
    ),
    { width: 1200, height: 630 }
  );
}
