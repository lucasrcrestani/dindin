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

/**
 * Open the settings modal.
 * @param {{ onSaved: (settings: object) => void }} options
 */
async function openSettingsModal({ onSaved }) {
  const settings = await getSettings();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
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
              <button type="button" class="btn btn--secondary" id="btn-cfg-export-json">Exportar JSON</button>
              <button type="button" class="btn btn--secondary" id="btn-cfg-import-json">Importar JSON</button>
            </div>
            <input type="file" id="cfg-csv-file" accept=".csv" style="display:none" />
            <input type="file" id="cfg-json-file" accept=".json" style="display:none" />
            <p id="cfg-csv-error" class="form-error" style="display:none"></p>
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

  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const close = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#btn-cfg-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // ── Drive section ────────────────────────────────────────────────────────────
  async function renderDriveSection() {
    const section = overlay.querySelector('#drive-section-content');
    if (!section) return;
    const s = await getSettings();

    if (!s.driveConnected) {
      section.innerHTML = `
        <p class="drive-info__meta" style="margin-bottom:0.5rem">Sincronize seus dados automaticamente com um arquivo JSON no Google Drive.</p>
        <button type="button" class="btn btn--secondary" id="btn-drive-connect">Conectar ao Google Drive</button>
        <p id="drive-error" class="form-error" style="display:none"></p>
      `;
      section.querySelector('#btn-drive-connect').addEventListener('click', () => handleConnect());
      return;
    }

    const lastSync = s.lastSyncedAt
      ? new Date(s.lastSyncedAt).toLocaleString('pt-BR')
      : 'Nunca';

    section.innerHTML = `
      <div class="drive-info">
        <span class="drive-info__icon" aria-hidden="true">&#x2601;</span>
        <div>
          <p class="drive-info__name">${s.driveFileName ?? 'arquivo desconhecido'}</p>
          <p class="drive-info__meta">Última sincronização: ${lastSync}</p>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
        <button type="button" class="btn btn--secondary" id="btn-drive-sync-now">Sincronizar agora</button>
        <button type="button" class="btn btn--secondary" id="btn-drive-change">Trocar arquivo</button>
        <button type="button" class="btn btn--danger"    id="btn-drive-disconnect">Desconectar</button>
      </div>
      <p id="drive-error" class="form-error" style="display:none"></p>
    `;

    const driveErrEl = () => section.querySelector('#drive-error');

    section.querySelector('#btn-drive-sync-now').addEventListener('click', async () => {
      driveErrEl().style.display = 'none';
      try {
        await syncWithDrive({ silent: false });
        await renderDriveSection();
      } catch (err) {
        driveErrEl().textContent = `Erro ao sincronizar: ${err.message}`;
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
  }

  async function handleConnect({ isChange = false } = {}) {
    const section = overlay.querySelector('#drive-section-content');

    if (!hasCredentials()) {
      try {
        await openDriveCredentialsModal();
      } catch {
        return;
      }
    }

    section.innerHTML = `<p class="drive-info__meta">Aguardando autorização do Google…</p>`;

    let token;
    try {
      token = await signIn();
    } catch (err) {
      await renderDriveSection();
      const e = overlay.querySelector('#drive-error');
      if (e) { e.textContent = `Erro ao conectar: ${err.message}`; e.style.display = 'block'; }
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
      } catch (err) {
        if (err.message.includes('cancelada')) return;
        const e = section.querySelector('#drive-error');
        e.textContent = `Erro: ${err.message}`; e.style.display = 'block';
      }
    });

    section.querySelector('#btn-drive-new').addEventListener('click', async () => {
      const rawName = window.prompt('Nome do arquivo no Google Drive:', 'dindin-dados.json');
      if (!rawName) return;
      const fileName = rawName.endsWith('.json') ? rawName : `${rawName}.json`;
      try {
        section.innerHTML = `<p class="drive-info__meta">Criando arquivo no Drive…</p>`;
        const localPayload = await getExportPayload();
        const driveFile = await createFile(fileName, localPayload);
        await finalizeConnection(driveFile.id, fileName);
      } catch (err) {
        await renderDriveSection();
        const e = overlay.querySelector('#drive-error');
        if (e) { e.textContent = `Erro ao criar arquivo: ${err.message}`; e.style.display = 'block'; }
      }
    });
  }

  async function finalizeConnection(fileId, fileName) {
    const fresh = await getSettings();
    await saveSettings({ ...fresh, driveConnected: true, driveFileId: fileId, driveFileName: fileName });
    startAutoSync();
    await renderDriveSyncButton();
    await renderDriveSection();
  }

  // Render drive section on open
  renderDriveSection();

  // ── JSON export ─────────────────────────────────────────────────────────────
  overlay.querySelector('#btn-cfg-export-json').addEventListener('click', async () => {
    const jsonErrorEl = overlay.querySelector('#cfg-json-error');
    jsonErrorEl.style.display = 'none';
    try {
      await exportData();
    } catch (err) {
      jsonErrorEl.textContent = `Erro ao exportar: ${err.message}`;
      jsonErrorEl.style.display = 'block';
    }
  });

  // ── JSON import ─────────────────────────────────────────────────────────────
  overlay.querySelector('#btn-cfg-import-json').addEventListener('click', () => {
    overlay.querySelector('#cfg-json-file').click();
  });

  overlay.querySelector('#cfg-json-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const jsonErrorEl = overlay.querySelector('#cfg-json-error');
    jsonErrorEl.style.display = 'none';

    try {
      const { payload, isNewer } = await parseImportFile(file);
      if (!isNewer) {
        const confirmed = window.confirm(
          'Os dados do arquivo são mais antigos ou iguais aos locais. Deseja substituir mesmo assim?'
        );
        if (!confirmed) {
          e.target.value = '';
          return;
        }
      }
      await importDataFromObject(payload);
      close();
      window.dispatchEvent(new CustomEvent('dindin:reload'));
    } catch (err) {
      jsonErrorEl.textContent = `Erro ao importar: ${err.message}`;
      jsonErrorEl.style.display = 'block';
      e.target.value = '';
    }
  });
  // ───────────────────────────────────────────────────────────────────────────

  // ── CSV import ──────────────────────────────────────────────────────────────
  overlay.querySelector('#btn-cfg-import-csv').addEventListener('click', () => {
    overlay.querySelector('#cfg-csv-file').click();
  });

  overlay.querySelector('#cfg-csv-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.group('[CSV Import] Arquivo selecionado');
    console.log('Nome:', file.name);
    console.log('Tamanho:', file.size, 'bytes');
    console.log('Tipo MIME:', file.type);

    const errorEl = overlay.querySelector('#cfg-csv-error');
    errorEl.style.display = 'none';

    let parsedData;
    try {
      const text = await file.text();
      parsedData = parseCSV(text);
      console.log('Resultado do parse:', {
        meses: parsedData.months,
        totalCategorias: parsedData.categories.length,
        despesas: parsedData.categories.filter((c) => c.recordType === 'expense').length,
        receitas: parsedData.categories.filter((c) => c.recordType === 'income').length,
      });
    } catch (err) {
      console.error('Falha no parseCSV:', err);
      console.groupEnd();
      errorEl.textContent = `Erro ao ler CSV: ${err.message}`;
      errorEl.style.display = 'block';
      // reset file input so the same file can be re-selected after fixing
      e.target.value = '';
      return;
    }

    const existingCategories = await getAllCategories();

    // Compute which CSV months fall outside the currently visible range
    const effectiveCurrentMonth = settings.currentMonth ?? parsedData.months[parsedData.months.length - 1];
    const visibleMonths = new Set();
    if (effectiveCurrentMonth) {
      visibleMonths.add(effectiveCurrentMonth);
      listPastMonths(effectiveCurrentMonth, settings.period).forEach((m) => visibleMonths.add(m));
    }
    const hiddenMonths = parsedData.months.filter((m) => !visibleMonths.has(m));
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
        close();
        window.dispatchEvent(new CustomEvent('dindin:reload'));
      },
    });
  });
  // ───────────────────────────────────────────────────────────────────────────

  overlay.querySelector('#form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const period = parseInt(overlay.querySelector('#cfg-period').value, 10) || 3;
    const currentMonth = overlay.querySelector('#cfg-month').value || null;
    // Fetch fresh settings so any drive fields saved during this modal session are preserved
    const fresh = await getSettings();
    const updated = await saveSettings({ ...fresh, period, currentMonth: currentMonth || fresh.currentMonth });
    close();
    onSaved(updated);
  });
}

export { openSettingsModal };
