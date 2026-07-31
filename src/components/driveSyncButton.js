import { syncWithDrive, confirmImportFromDrive } from '../services/driveService.js';
import { getSettings } from '../services/settingsService.js';
import { BaseComponent } from './baseComponent.js';

function _formatTime(isoString) {
  if (!isoString) return 'Nunca';
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

class DindinDriveSyncButton extends BaseComponent {
  constructor() {
    super();
    this._buttonEl = null;
    this._syncing = false;
    this._confirmationPending = false;
    this._handleClick = this._handleClick.bind(this);
    this._handleSynced = this._handleSynced.bind(this);
    this._handleSyncError = this._handleSyncError.bind(this);
    this._handleAuthNeeded = this._handleAuthNeeded.bind(this);
    this._handleSyncConfirmationNeeded = this._handleSyncConfirmationNeeded.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('dindin:drive-synced', this._handleSynced);
    window.addEventListener('dindin:drive-sync-error', this._handleSyncError);
    window.addEventListener('dindin:drive-auth-needed', this._handleAuthNeeded);
    window.addEventListener('dindin:sync-confirmation-needed', this._handleSyncConfirmationNeeded);
  }

  disconnectedCallback() {
    window.removeEventListener('dindin:drive-synced', this._handleSynced);
    window.removeEventListener('dindin:drive-sync-error', this._handleSyncError);
    window.removeEventListener('dindin:drive-auth-needed', this._handleAuthNeeded);
    window.removeEventListener('dindin:sync-confirmation-needed', this._handleSyncConfirmationNeeded);
  }

  render() {
    const { settings } = this.data;
    if (!settings?.driveConnected) {
      this._buttonEl = null;
      this.replaceContent();
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
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

    this._buttonEl = wrapper.querySelector('#btn-drive-sync');
    this._buttonEl.addEventListener('click', this._handleClick);
    this.replaceContent(wrapper);
  }

  async _handleClick() {
    if (this._syncing) return;
    this._syncing = true;
    this._setLoading(true);
    try {
      await syncWithDrive({ silent: false });
    } catch (error) {
      console.error('[DriveSyncButton]', error);
      this._setError();
    } finally {
      this._syncing = false;
      this._setLoading(false);
    }
  }

  _setLoading(on) {
    if (!this._buttonEl) return;
    this._buttonEl.disabled = on;
    this._buttonEl.classList.toggle('drive-sync-btn--loading', on);
  }

  _setError() {
    if (!this._buttonEl) return;
    this._buttonEl.classList.add('drive-sync-btn--error');
    setTimeout(() => this._buttonEl?.classList.remove('drive-sync-btn--error'), 3000);
  }

  _handleSynced(event) {
    this._buttonEl?.classList.remove('drive-sync-btn--error');
    const timeEl = this._buttonEl?.querySelector('.drive-sync-btn__time');
    if (timeEl) timeEl.textContent = _formatTime(event.detail?.lastSyncedAt);
  }

  _handleSyncError() {
    this._setError();
  }

  _handleAuthNeeded() {
    if (!this._buttonEl) return;
    const icon = this._buttonEl.querySelector('.drive-sync-btn__icon');
    if (icon) icon.textContent = '⚠';
    const time = this._buttonEl.querySelector('.drive-sync-btn__time');
    if (time) time.textContent = 'Reconectar';
    this._buttonEl.title = 'Sessão expirada — clique para reconectar';
  }

  async _handleSyncConfirmationNeeded(event) {
    if (this._confirmationPending) return;
    this._confirmationPending = true;
    const { payload } = event.detail;
    const confirmed = window.confirm(
      'Os dados do Drive são mais antigos ou iguais aos dados locais. Deseja substituir os dados locais mesmo assim?'
    );
    if (confirmed) {
      try {
        await confirmImportFromDrive(payload);
      } catch (error) {
        console.error('[DriveSyncButton] Erro ao confirmar importação:', error);
      }
    }
    this._confirmationPending = false;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-drive-sync-button')) {
  customElements.define('dindin-drive-sync-button', DindinDriveSyncButton);
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
    return;
  }

  const element = document.createElement('dindin-drive-sync-button');
  element.data = { settings };
  container.innerHTML = '';
  container.appendChild(element);
}

export { renderDriveSyncButton };
