// Pantalla de login del equipo. No hace falta para usar el cancionero, el
// visor ni armar listas — sólo hace falta sesión iniciada para publicar y
// para sincronizar el cancionero entre dispositivos (ver publicarView.js y
// storage/sync.js). Después de loguearse, vuelve a la pantalla desde donde
// vino (o a la biblioteca), y dispara una sincronización.
import { signIn } from '../storage/auth.js';
import { isSupabaseConfigured } from '../storage/supabaseClient.js';
import { syncNow } from '../storage/sync.js';
import { syncSpacesNow } from '../storage/spacesSync.js';

export function renderLoginView(container, { returnTo } = {}) {
  container.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-icon">🎼</div>
        <h1 class="login-title">Ingreso del equipo</h1>
        <p class="login-subtitle">Para publicar la lista de misa y sincronizar el cancionero</p>

        ${
          isSupabaseConfigured
            ? ''
            : `<div class="login-error">
                Falta configurar Supabase (URL + anon key) en
                <code>src/storage/supabaseClient.js</code>. Mientras tanto no se
                puede iniciar sesión, pero el resto de la app anda igual.
              </div>`
        }

        <label class="login-field">
          <span>Email</span>
          <input type="email" id="email-input" autocomplete="username" placeholder="equipo@parroquia.com" />
        </label>
        <label class="login-field">
          <span>Contraseña</span>
          <div class="password-field">
            <input type="password" id="password-input" autocomplete="current-password" />
            <button type="button" class="password-toggle" id="toggle-password" tabindex="-1" title="Mostrar/ocultar contraseña">👁</button>
          </div>
        </label>

        <div id="login-error" class="login-error" hidden></div>

        <button class="btn btn-accent login-submit" id="login-btn" ${isSupabaseConfigured ? '' : 'disabled'}>
          Ingresar
        </button>

        <a class="login-back" href="#/library">← Volver sin iniciar sesión</a>
      </div>
    </div>
  `;

  const emailInput = container.querySelector('#email-input');
  const passwordInput = container.querySelector('#password-input');
  const errorEl = container.querySelector('#login-error');
  const loginBtn = container.querySelector('#login-btn');

  container.querySelector('#toggle-password').addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
  });

  async function attemptLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showError('Completá email y contraseña.');
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';
    try {
      await signIn(email, password);
      // Arrancan en segundo plano, no hace falta esperarlas para navegar —
      // así, apenas se loguea por primera vez en un dispositivo nuevo, le
      // llegan solas el cancionero y la lista de parroquias/capillas.
      syncNow();
      syncSpacesNow();
      window.location.hash = returnTo || '#/library';
    } catch (err) {
      showError(
        err.message === 'Failed to fetch'
          ? 'No hay conexión a internet. Para iniciar sesión hace falta wifi/datos la primera vez.'
          : 'Email o contraseña incorrectos.'
      );
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Ingresar';
    }
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  loginBtn.addEventListener('click', attemptLogin);
  passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') attemptLogin();
  });
  emailInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') passwordInput.focus();
  });
}
