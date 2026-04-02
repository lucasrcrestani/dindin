import { getSettings, saveSettings } from '../services/settingsService.js';
import { getAllCategories } from '../services/categoryService.js';
import { parseCSV, executeCSVImport } from '../services/csvImportService.js';
import { openCSVImportModal } from './csvImportModal.js';
import { listPastMonths } from '../utils/dateUtils.js';

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
            <label>Importar dados</label>
            <button type="button" class="btn btn--secondary" id="btn-cfg-import-csv">Importar CSV</button>
            <input type="file" id="cfg-csv-file" accept=".csv" style="display:none" />
            <p id="cfg-csv-error" class="form-error" style="display:none"></p>
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
    const currentMonth = overlay.querySelector('#cfg-month').value || settings.currentMonth;
    const updated = await saveSettings({ ...settings, period, currentMonth });
    close();
    onSaved(updated);
  });
}

export { openSettingsModal };
