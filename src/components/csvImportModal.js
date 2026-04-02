import RecordType from '../models/RecordType.js';
import { formatCurrency } from '../utils/formatters.js';
import { formatMonthLabel } from '../utils/dateUtils.js';

/**
 * Open the CSV import modal (2-step: mapping → preview table → confirm).
 *
 * @param {{
 *   parsedData: import('../services/csvImportService.js').ParsedCSV,
 *   existingCategories: import('../models/Category.js').Category[],
 *   onConfirm: (mappings: import('../services/csvImportService.js').Mapping[]) => void
 * }} options
 */
function openCSVImportModal({ parsedData, existingCategories, hiddenMonths = [], onConfirm }) {
  const { categories } = parsedData;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="modal-csv-title">
      <div class="modal__header">
        <h2 id="modal-csv-title" class="modal__title">Importar CSV</h2>
        <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal__body" id="csv-modal-body"></div>
    </div>
  `;

  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const close = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Initial mappings state: auto-select "mapTo" on exact name match
  /** @type {import('../services/csvImportService.js').Mapping[]} */
  const mappings = categories.map((cat) => {
    const match = existingCategories.find(
      (ec) => ec.name.trim().toLowerCase() === cat.name.trim().toLowerCase()
    );
    if (match) return { action: 'mapTo', existingCategoryId: match.id };
    return { action: 'create' };
  });

  renderStep1();

  // ─── Step 1: Mapping ────────────────────────────────────────────────────────

  function renderStep1() {
    const body = overlay.querySelector('#csv-modal-body');

    const expenses = categories.filter((c) => c.recordType === RecordType.EXPENSE);
    const income = categories.filter((c) => c.recordType === RecordType.INCOME);

    body.innerHTML = `
      ${hiddenMonths.length > 0 ? `
        <div class="csv-import__warning">
          ⚠️ Os seguintes meses não serão visíveis com as configurações atuais de histórico:
          <ul class="csv-import__warning-list">
            ${hiddenMonths.map((m) => `<li>${capitalize(formatMonthLabel(m))}</li>`).join('')}
          </ul>
          Para vê-los, aumente o período de histórico nas configurações.
        </div>` : ''}
      <p class="csv-import__hint">Para cada categoria do CSV, escolha a ação desejada.</p>
      ${renderSectionTable('Despesas', expenses, categories)}
      ${income.length ? renderSectionTable('Receitas', income, categories) : ''}
      <div class="modal__footer">
        <button type="button" class="btn btn--secondary" id="btn-csv-cancel">Cancelar</button>
        <button type="button" class="btn btn--primary" id="btn-csv-review">Revisar importação →</button>
      </div>
    `;

    // Restore current mapping selections into the selects
    categories.forEach((cat, i) => {
      const sel = body.querySelector(`[data-cat-index="${i}"]`);
      if (!sel) return;
      const m = mappings[i];
      if (m.action === 'skip') {
        sel.value = 'skip';
      } else if (m.action === 'mapTo') {
        sel.value = `mapTo:${m.existingCategoryId}`;
      } else {
        sel.value = 'create';
      }
    });

    body.querySelector('#btn-csv-cancel').addEventListener('click', close);
    body.querySelector('#btn-csv-review').addEventListener('click', () => {
      // Collect current mapping selections
      categories.forEach((cat, i) => {
        const sel = body.querySelector(`[data-cat-index="${i}"]`);
        if (!sel) return;
        const val = sel.value;
        if (val === 'skip') {
          mappings[i] = { action: 'skip' };
        } else if (val.startsWith('mapTo:')) {
          mappings[i] = { action: 'mapTo', existingCategoryId: val.slice(6) };
        } else {
          mappings[i] = { action: 'create' };
        }
      });
      renderStep2();
    });
  }

  function renderSectionTable(title, sectionCats, allCats) {
    const rows = sectionCats.map((cat) => {
      const i = allCats.indexOf(cat);
      const currentMapping = mappings[i];

      const defaultVal = currentMapping.action === 'skip'
        ? 'skip'
        : currentMapping.action === 'mapTo'
          ? `mapTo:${currentMapping.existingCategoryId}`
          : 'create';

      const sameTypeExisting = existingCategories.filter((ec) => ec.recordType === cat.recordType);
      const mapOptions = sameTypeExisting
        .map((ec) => `<option value="mapTo:${escapeAttr(ec.id)}"${defaultVal === `mapTo:${ec.id}` ? ' selected' : ''}>${escapeHtml(ec.name)}</option>`)
        .join('');

      return `
        <tr>
          <td>${escapeHtml(cat.name)}</td>
          <td>${cat.tags.join(', ') || '—'}</td>
          <td>${formatCurrency(cat.idealValue)}</td>
          <td>
            <select data-cat-index="${i}" class="csv-import__select">
              <option value="create"${defaultVal === 'create' ? ' selected' : ''}>✨ Criar nova categoria</option>
              ${mapOptions}
              <option value="skip"${defaultVal === 'skip' ? ' selected' : ''}>— Ignorar</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <h3 class="csv-import__section-title">${title}</h3>
      <div class="csv-import__table-wrap">
        <table class="csv-import__table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Tag</th>
              <th>Valor Ideal</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ─── Step 2: Preview ────────────────────────────────────────────────────────

  function renderStep2() {
    const body = overlay.querySelector('#csv-modal-body');

    const rows = categories.map((cat, i) => {
      const m = mappings[i];

      let acaoHtml;
      if (m.action === 'skip') {
        acaoHtml = '<span class="csv-import__badge csv-import__badge--skip">⚪ Ignorada</span>';
      } else if (m.action === 'mapTo') {
        const existing = existingCategories.find((ec) => ec.id === m.existingCategoryId);
        const label = existing ? escapeHtml(existing.name) : m.existingCategoryId;
        acaoHtml = `<span class="csv-import__badge csv-import__badge--merge">🔵 Merge com ${label}</span>`;
      } else {
        acaoHtml = '<span class="csv-import__badge csv-import__badge--create">🟢 Nova categoria</span>';
      }

      const tipo = cat.recordType === RecordType.INCOME ? 'Receita' : 'Despesa';
      const registros = Object.entries(cat.monthValues)
        .map(([mk, v]) => `${formatMonthAbbrev(mk)}: ${formatCurrency(v)}`)
        .join('<br>');

      return `
        <tr>
          <td>${acaoHtml}</td>
          <td>${escapeHtml(cat.name)}</td>
          <td>${cat.tags.join(', ') || '—'}</td>
          <td>${tipo}</td>
          <td>${formatCurrency(cat.idealValue)}</td>
          <td class="csv-import__records">${registros || '—'}</td>
        </tr>
      `;
    }).join('');

    body.innerHTML = `
      <div class="csv-import__table-wrap">
        <table class="csv-import__table">
          <thead>
            <tr>
              <th>Ação</th>
              <th>Categoria</th>
              <th>Tag</th>
              <th>Tipo</th>
              <th>Valor Ideal</th>
              <th>Registros</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--secondary" id="btn-csv-back">← Voltar</button>
        <button type="button" class="btn btn--primary" id="btn-csv-confirm">Confirmar importação</button>
      </div>
    `;

    body.querySelector('#btn-csv-back').addEventListener('click', renderStep1);
    body.querySelector('#btn-csv-confirm').addEventListener('click', () => {
      close();
      onConfirm(mappings);
    });
  }
}

/** Format a YYYY-MM key to a short label like "jan.-25" */
function formatMonthAbbrev(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace(' de ', '-')
    .replace('.', '.');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

export { openCSVImportModal };
