import { getSettings, saveSettings } from '../services/settingsService.js';
import { getAllCategories } from '../services/categoryService.js';
import { parseCSV, executeCSVImport } from '../services/csvImportService.js';
import { openCSVImportModal } from './csvImportModal.js';
import { listPastMonths } from '../utils/dateUtils.js';
import { exportData, importDataFromObject, parseImportFile, getExportPayload } from '../services/importExportService.js';
import { signIn, signOut, createFile, syncWithDrive, startAutoSync, stopAutoSync, hasCredentials, clearCredentials } from '../services/driveService.js';
import { openFilePicker } from '../services/pickerService.js';
import { openDriveCredentialsModal } from './driveCredentialsModal.js';
import { renderDriveSyncButton } from './driveSyncButton.js';
import { BaseComponent } from './baseComponent.js';
import { parseOFX, mapTransactionsToBulkRows } from '../services/ofxImportService.js';

class DindinSettingsModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  async render() {
    const { settings, onSaved } = this.data;
    if (!settings) {
      this.replaceContent();
      return;
    }

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-cfg-title">
        <div class="modal__header">
          <h2 id="modal-cfg-title" class="modal__title">Configurações</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">
          <form id="form-settings">
            <div class="form-group">
              <label for="cfg-period">Meses no histórico</label>
              <input id="cfg-period" type="number" min="1" max="24" value="${settings.period}" />
            </div>
            <div class="form-group">
              <label for="cfg-month">Mês atual</label>
              <input id="cfg-month" type="month" value="${settings.currentMonth ?? ''}" />
            </div>
            <div class="form-group">
              <label>Exportar / Importar dados</label>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                <button type="button" class="btn btn--secondary" id="btn-cfg-import-csv">Importar CSV</button>
                <button type="button" class="btn btn--secondary" id="btn-cfg-import-ofx">Importar OFX</button>
                <button type="button" class="btn btn--secondary" id="btn-cfg-export-json">Exportar JSON</button>
                <button type="button" class="btn btn--secondary" id="btn-cfg-import-json">Importar JSON</button>
              </div>
              <input type="file" id="cfg-csv-file" accept=".csv" style="display:none" />
              <input type="file" id="cfg-ofx-file" accept=".ofx,.qfx" style="display:none" />
              <input type="file" id="cfg-json-file" accept=".json" style="display:none" />
              <p id="cfg-csv-error" class="form-error" style="display:none"></p>
              <p id="cfg-ofx-error" class="form-error" style="display:none"></p>
              <p id="cfg-json-error" class="form-error" style="display:none"></p>
            </div>
            <div class="form-group">
              <label>Google Drive</label>
              <div id="drive-section-content"></div>
            </div>
            <div class="modal__footer">
              <button type="button" class="btn btn--secondary" id="btn-cfg-cancel">Cancelar</button>
              <button type="submit" class="btn btn--primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    wrapper.querySelector('#btn-cfg-cancel').addEventListener('click', () => this.close());
    this.addEventListener('click', (event) => {
      if (event.composedPath()[0] === this) this.close();
    });

    const renderDriveSection = async () => {
      const section = wrapper.querySelector('#drive-section-content');
      if (!section) return;
      const currentSettings = await getSettings();

      if (!currentSettings.driveConnected) {
        section.innerHTML = `
          <p class="drive-info__meta" style="margin-bottom:0.5rem">Sincronize seus dados automaticamente com um arquivo JSON no Google Drive.</p>
          <button type="button" class="btn btn--secondary" id="btn-drive-connect">Conectar ao Google Drive</button>
          <p id="drive-error" class="form-error" style="display:none"></p>
        `;
        section.querySelector('#btn-drive-connect').addEventListener('click', () => handleConnect());
        return;
      }

      const lastSync = currentSettings.lastSyncedAt ? new Date(currentSettings.lastSyncedAt).toLocaleString('pt-BR') : 'Nunca';
      section.innerHTML = `
        <div class="drive-info">
          <span class="drive-info__icon" aria-hidden="true">&#x2601;</span>
          <div>
            <p class="drive-info__name">${currentSettings.driveFileName ?? 'arquivo desconhecido'}</p>
            <p class="drive-info__meta">Última sincronização: ${lastSync}</p>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
          <button type="button" class="btn btn--secondary" id="btn-drive-sync-now">Sincronizar agora</button>
          <button type="button" class="btn btn--secondary" id="btn-drive-change">Trocar arquivo</button>
          <button type="button" class="btn btn--danger" id="btn-drive-disconnect">Desconectar</button>
        </div>
        <p id="drive-error" class="form-error" style="display:none"></p>
      `;

      const driveErrEl = () => section.querySelector('#drive-error');
      section.querySelector('#btn-drive-sync-now').addEventListener('click', async () => {
        driveErrEl().style.display = 'none';
        try {
          await syncWithDrive({ silent: false });
          await renderDriveSection();
        } catch (error) {
          driveErrEl().textContent = `Erro ao sincronizar: ${error.message}`;
          driveErrEl().style.display = 'block';
        }
      });

      section.querySelector('#btn-drive-change').addEventListener('click', () => handleConnect({ isChange: true }));
      section.querySelector('#btn-drive-disconnect').addEventListener('click', async () => {
        await signOut();
        clearCredentials();
        stopAutoSync();
        await renderDriveSyncButton();
        await renderDriveSection();
      });
    };

    const finalizeConnection = async (fileId, fileName) => {
      const fresh = await getSettings();
      await saveSettings({ ...fresh, driveConnected: true, driveFileId: fileId, driveFileName: fileName });
      startAutoSync();
      await renderDriveSyncButton();
      await renderDriveSection();
    };

    const handleConnect = async ({ isChange = false } = {}) => {
      const section = wrapper.querySelector('#drive-section-content');
      if (!hasCredentials()) {
        try {
          await openDriveCredentialsModal();
        } catch {
          return;
        }
      }

      section.innerHTML = '<p class="drive-info__meta">Aguardando autorização do Google…</p>';

      let token;
      try {
        token = await signIn();
      } catch (error) {
        await renderDriveSection();
        const e = wrapper.querySelector('#drive-error');
        if (e) {
          e.textContent = `Erro ao conectar: ${error.message}`;
          e.style.display = 'block';
        }
        return;
      }

      section.innerHTML = `
        <p class="drive-info__meta" style="margin-bottom:0.5rem">Escolha como usar o Google Drive:</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button type="button" class="btn btn--secondary" id="btn-drive-pick">Selecionar arquivo existente</button>
          <button type="button" class="btn btn--secondary" id="btn-drive-new">Criar novo arquivo</button>
        </div>
        <p id="drive-error" class="form-error" style="display:none"></p>
      `;

      section.querySelector('#btn-drive-pick').addEventListener('click', async () => {
        try {
          const file = await openFilePicker(token);
          await finalizeConnection(file.id, file.name);
        } catch (error) {
          if (error.message.includes('cancelada')) return;
          const e = section.querySelector('#drive-error');
          e.textContent = `Erro: ${error.message}`;
          e.style.display = 'block';
        }
      });

      section.querySelector('#btn-drive-new').addEventListener('click', async () => {
        const rawName = window.prompt('Nome do arquivo no Google Drive:', 'dindin-dados.json');
        if (!rawName) return;
        const fileName = rawName.endsWith('.json') ? rawName : `${rawName}.json`;
        try {
          section.innerHTML = '<p class="drive-info__meta">Criando arquivo no Drive…</p>';
          const localPayload = await getExportPayload();
          const driveFile = await createFile(fileName, localPayload);
          await finalizeConnection(driveFile.id, fileName);
        } catch (error) {
          await renderDriveSection();
          const e = wrapper.querySelector('#drive-error');
          if (e) {
            e.textContent = `Erro ao criar arquivo: ${error.message}`;
            e.style.display = 'block';
          }
        }
      });
    };

    await renderDriveSection();

    wrapper.querySelector('#btn-cfg-export-json').addEventListener('click', async () => {
      const jsonErrorEl = wrapper.querySelector('#cfg-json-error');
      jsonErrorEl.style.display = 'none';
      try {
        await exportData();
      } catch (error) {
        jsonErrorEl.textContent = `Erro ao exportar: ${error.message}`;
        jsonErrorEl.style.display = 'block';
      }
    });

    wrapper.querySelector('#btn-cfg-import-json').addEventListener('click', () => {
      wrapper.querySelector('#cfg-json-file').click();
    });

    wrapper.querySelector('#cfg-json-file').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const jsonErrorEl = wrapper.querySelector('#cfg-json-error');
      jsonErrorEl.style.display = 'none';

      try {
        const { payload, isNewer } = await parseImportFile(file);
        if (!isNewer) {
          const confirmed = window.confirm('Os dados do arquivo são mais antigos ou iguais aos locais. Deseja substituir mesmo assim?');
          if (!confirmed) {
            event.target.value = '';
            return;
          }
        }
        await importDataFromObject(payload);
        this.close();
        window.dispatchEvent(new CustomEvent('dindin:reload'));
      } catch (error) {
        jsonErrorEl.textContent = `Erro ao importar: ${error.message}`;
        jsonErrorEl.style.display = 'block';
        event.target.value = '';
      }
    });

    wrapper.querySelector('#btn-cfg-import-csv').addEventListener('click', () => {
      wrapper.querySelector('#cfg-csv-file').click();
    });

    wrapper.querySelector('#cfg-csv-file').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      console.group('[CSV Import] Arquivo selecionado');
      console.log('Nome:', file.name);
      console.log('Tamanho:', file.size, 'bytes');
      console.log('Tipo MIME:', file.type);

      const errorEl = wrapper.querySelector('#cfg-csv-error');
      errorEl.style.display = 'none';

      let parsedData;
      try {
        const text = await file.text();
        parsedData = parseCSV(text);
        console.log('Resultado do parse:', {
          meses: parsedData.months,
          totalCategorias: parsedData.categories.length,
          despesas: parsedData.categories.filter((category) => category.recordType === 'expense').length,
          receitas: parsedData.categories.filter((category) => category.recordType === 'income').length,
        });
      } catch (error) {
        console.error('Falha no parseCSV:', error);
        console.groupEnd();
        errorEl.textContent = `Erro ao ler CSV: ${error.message}`;
        errorEl.style.display = 'block';
        event.target.value = '';
        return;
      }

      const existingCategories = await getAllCategories();
      const effectiveCurrentMonth = settings.currentMonth ?? parsedData.months[parsedData.months.length - 1];
      const visibleMonths = new Set();
      if (effectiveCurrentMonth) {
        visibleMonths.add(effectiveCurrentMonth);
        listPastMonths(effectiveCurrentMonth, settings.period).forEach((month) => visibleMonths.add(month));
      }
      const hiddenMonths = parsedData.months.filter((month) => !visibleMonths.has(month));
      console.log('[CSV Import] Meses visíveis:', [...visibleMonths]);
      console.log('[CSV Import] Meses fora do alcance:', hiddenMonths);

      openCSVImportModal({
        parsedData,
        existingCategories,
        hiddenMonths,
        onConfirm: async (mappings) => {
          const result = await executeCSVImport(parsedData.categories, mappings);
          console.log('[CSV Import] Importação finalizada:', result);
          if (!settings.currentMonth && parsedData.months.length > 0) {
            const latestMonth = parsedData.months[parsedData.months.length - 1];
            console.log('[CSV Import] currentMonth ausente — definindo para:', latestMonth);
            await saveSettings({ ...settings, currentMonth: latestMonth });
          }
          console.groupEnd();
          this.close();
          window.dispatchEvent(new CustomEvent('dindin:reload'));
        },
      });
    });

    wrapper.querySelector('#btn-cfg-import-ofx').addEventListener('click', () => {
      wrapper.querySelector('#cfg-ofx-file').click();
    });

    wrapper.querySelector('#cfg-ofx-file').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const errorEl = wrapper.querySelector('#cfg-ofx-error');
      errorEl.style.display = 'none';
      try {
        const text = await file.text();
        const transactions = parseOFX(text);
        const rows = mapTransactionsToBulkRows(transactions);
        console.log('[OFX Import] Transações importadas:', rows.length);
        this.close();
        window.dispatchEvent(new CustomEvent('dindin:ofx-bulk-add', { detail: { rows } }));
      } catch (error) {
        errorEl.textContent = `Erro ao ler OFX: ${error.message}`;
        errorEl.style.display = 'block';
        event.target.value = '';
      }
    });

    wrapper.querySelector('#form-settings').addEventListener('submit', async (event) => {
      event.preventDefault();
      const period = parseInt(wrapper.querySelector('#cfg-period').value, 10) || 3;
      const currentMonth = wrapper.querySelector('#cfg-month').value || null;
      const fresh = await getSettings();
      const updated = await saveSettings({ ...fresh, period, currentMonth: currentMonth || fresh.currentMonth });
      this.close();
      onSaved?.(updated);
    });

    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-settings-modal')) {
  customElements.define('dindin-settings-modal', DindinSettingsModal);
}

/**
 * Open the settings modal.
 * @param {{ onSaved: (settings: object) => void }} options
 */
async function openSettingsModal({ onSaved }) {
  const settings = await getSettings();
  const modal = document.createElement('dindin-settings-modal');
  modal.data = { settings, onSaved };
  document.getElementById('modals').appendChild(modal);
}

export { openSettingsModal };
