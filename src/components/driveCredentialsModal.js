import { saveCredentials } from '../services/driveService.js';

/**
 * Opens a modal asking the user to enter their Google Cloud credentials.
 * Resolves with the saved credentials object when the user confirms,
 * or rejects if the user cancels.
 *
 * @returns {Promise<{ clientId: string, apiKey: string, appId: string }>}
 */
function openDriveCredentialsModal() {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-creds-title">
        <div class="modal__header">
          <h2 id="modal-creds-title" class="modal__title">Configurar credenciais do Google</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">
          <p style="margin-bottom:1rem;font-size:0.9rem;color:var(--color-text-secondary)">
            Para usar o Google Drive, informe as credenciais do seu projeto no
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>.
            Elas serão salvas apenas neste navegador.
          </p>
          <form id="form-creds" novalidate>
            <div class="form-group">
              <label for="creds-client-id">Client ID <span aria-hidden="true">*</span></label>
              <input id="creds-client-id" type="text" placeholder="xxxx.apps.googleusercontent.com" required autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="creds-api-key">API Key <span aria-hidden="true">*</span></label>
              <input id="creds-api-key" type="text" placeholder="AIzaSy…" required autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="creds-app-id">App ID (número do projeto) <span aria-hidden="true">*</span></label>
              <input id="creds-app-id" type="text" placeholder="000000000000" required autocomplete="off" />
            </div>
            <p id="creds-error" class="form-error" style="display:none"></p>
            <div class="modal__footer">
              <button type="button" class="btn btn--secondary" id="btn-creds-cancel">Cancelar</button>
              <button type="submit" class="btn btn--primary">Salvar e Conectar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('modals').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

    const close = (err) => {
      overlay.classList.remove('modal-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      if (err) reject(err);
    };

    overlay.querySelector('.modal__close').addEventListener('click', () =>
      close(new Error('Cancelado pelo usuário.')),
    );
    overlay.querySelector('#btn-creds-cancel').addEventListener('click', () =>
      close(new Error('Cancelado pelo usuário.')),
    );
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(new Error('Cancelado pelo usuário.'));
    });

    overlay.querySelector('#form-creds').addEventListener('submit', (e) => {
      e.preventDefault();
      const clientId = overlay.querySelector('#creds-client-id').value.trim();
      const apiKey   = overlay.querySelector('#creds-api-key').value.trim();
      const appId    = overlay.querySelector('#creds-app-id').value.trim();
      const errEl    = overlay.querySelector('#creds-error');

      if (!clientId || !apiKey || !appId) {
        errEl.textContent = 'Preencha todos os campos.';
        errEl.style.display = 'block';
        return;
      }

      saveCredentials({ clientId, apiKey, appId });
      overlay.classList.remove('modal-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve({ clientId, apiKey, appId });
    });
  });
}

export { openDriveCredentialsModal };
