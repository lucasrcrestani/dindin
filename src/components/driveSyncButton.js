import { syncWithDrive, confirmImportFromDrive } from '../services/driveService.js';
import { getSettings } from '../services/settingsService.js';

let _buttonEl = null;
let _syncing  = false;
let _confirmationPending = false;

function _formatTime(isoString) {
  if (!isoString) return 'Nunca';
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Renders (or clears) the Drive sync button inside `#drive-sync-area`.
 * Call this whenever the connection state changes.
 */
async function renderDriveSyncButton() {
  const container = document.getElementById('drive-sync-area');
  if (!container) return;

  const settings = await getSettings();

  if (!settings.driveConnected) {
    container.innerHTML = '';
    _buttonEl = null;
    return;
  }

  container.innerHTML = `
    <button
      id="btn-drive-sync"
      class="btn-icon drive-sync-btn"
      title="Sincronizar com Google Drive"
      aria-label="Sincronizar com Google Drive"
    >
      <span class="drive-sync-btn__icon" aria-hidden="true">&#x2601;</span>
      <span class="drive-sync-btn__time">${_formatTime(settings.lastSyncedAt)}</span>
    </button>
  `;

  _buttonEl = container.querySelector('#btn-drive-sync');
  _buttonEl.addEventListener('click', _handleClick);
}

async function _handleClick() {
  if (_syncing) return;
  _syncing = true;
  _setLoading(true);
  try {
    await syncWithDrive({ silent: false });
  } catch (err) {
    console.error('[DriveSyncButton]', err);
    _setError();
  } finally {
    _syncing = false;
    _setLoading(false);
  }
}

function _setLoading(on) {
  if (!_buttonEl) return;
  _buttonEl.disabled = on;
  _buttonEl.classList.toggle('drive-sync-btn--loading', on);
}

function _setError() {
  if (!_buttonEl) return;
  _buttonEl.classList.add('drive-sync-btn--error');
  setTimeout(() => _buttonEl?.classList.remove('drive-sync-btn--error'), 3000);
}

// ── Event listeners ───────────────────────────────────────────────────────────
window.addEventListener('dindin:drive-synced', (e) => {
  _buttonEl?.classList.remove('drive-sync-btn--error');
  const timeEl = _buttonEl?.querySelector('.drive-sync-btn__time');
  if (timeEl) timeEl.textContent = _formatTime(e.detail?.lastSyncedAt);
});

window.addEventListener('dindin:drive-sync-error', _setError);

window.addEventListener('dindin:drive-auth-needed', () => {
  if (!_buttonEl) return;
  const icon = _buttonEl.querySelector('.drive-sync-btn__icon');
  if (icon) icon.textContent = '⚠';
  const time = _buttonEl.querySelector('.drive-sync-btn__time');
  if (time) time.textContent = 'Reconectar';
  _buttonEl.title = 'Sessão expirada — clique para reconectar';
});

window.addEventListener('dindin:sync-confirmation-needed', async (e) => {
  if (_confirmationPending) return;
  _confirmationPending = true;
  const { payload } = e.detail;
  const confirmed = window.confirm(
    'Os dados do Drive são mais antigos ou iguais aos dados locais. Deseja substituir os dados locais mesmo assim?'
  );
  if (confirmed) {
    try {
      await confirmImportFromDrive(payload);
    } catch (err) {
      console.error('[DriveSyncButton] Erro ao confirmar importação:', err);
    }
  }
  _confirmationPending = false;
});

export { renderDriveSyncButton };
