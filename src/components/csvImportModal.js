import RecordType from '../models/RecordType.js';
import { formatCurrency } from '../utils/formatters.js';
import { formatMonthLabel } from '../utils/dateUtils.js';
import { BaseComponent } from './baseComponent.js';

class DindinCsvImportModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  render() {
    const { parsedData, existingCategories = [], hiddenMonths = [], onConfirm } = this.data;
    const categories = parsedData?.categories ?? [];
    if (!this._mappings) {
      this._mappings = categories.map((cat) => {
        const match = existingCategories.find((existingCategory) => existingCategory.name.trim().toLowerCase() === cat.name.trim().toLowerCase());
        if (match) return { action: 'mapTo', existingCategoryId: match.id };
        return { action: 'create' };
      });
    }

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="modal-csv-title">
        <div class="modal__header">
          <h2 id="modal-csv-title" class="modal__title">Importar CSV</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body" id="csv-modal-body"></div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    this.addEventListener('click', (event) => {
      if (event.composedPath()[0] === this) this.close();
    });

    const body = wrapper.querySelector('#csv-modal-body');

    const renderSectionTable = (title, sectionCats, allCats) => {
      const rows = sectionCats.map((cat) => {
        const index = allCats.indexOf(cat);
        const currentMapping = this._mappings[index];
        const defaultVal = currentMapping.action === 'skip'
          ? 'skip'
          : currentMapping.action === 'mapTo'
            ? `mapTo:${currentMapping.existingCategoryId}`
            : 'create';

        const sameTypeExisting = existingCategories.filter((existingCategory) => existingCategory.recordType === cat.recordType);
        const mapOptions = sameTypeExisting
          .map((existingCategory) => `<option value="mapTo:${escapeAttr(existingCategory.id)}"${defaultVal === `mapTo:${existingCategory.id}` ? ' selected' : ''}>${escapeHtml(existingCategory.name)}</option>`)
          .join('');

        return `
          <tr>
            <td>${escapeHtml(cat.name)}</td>
            <td>${cat.tags.length ? cat.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('') : '—'}</td>
            <td>${formatCurrency(cat.idealValue)}</td>
            <td>
              <select data-cat-index="${index}" class="csv-import__select">
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
    };

    const renderStep1 = () => {
      const expenses = categories.filter((category) => category.recordType === RecordType.EXPENSE);
      const income = categories.filter((category) => category.recordType === RecordType.INCOME);

      body.innerHTML = `
        ${hiddenMonths.length > 0 ? `
          <div class="csv-import__warning">
            ⚠️ Os seguintes meses não serão visíveis com as configurações atuais de histórico:
            <ul class="csv-import__warning-list">
              ${hiddenMonths.map((month) => `<li>${capitalize(formatMonthLabel(month))}</li>`).join('')}
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

      categories.forEach((cat, index) => {
        const select = body.querySelector(`[data-cat-index="${index}"]`);
        if (!select) return;
        const mapping = this._mappings[index];
        if (mapping.action === 'skip') {
          select.value = 'skip';
        } else if (mapping.action === 'mapTo') {
          select.value = `mapTo:${mapping.existingCategoryId}`;
        } else {
          select.value = 'create';
        }
      });

      body.querySelector('#btn-csv-cancel').addEventListener('click', () => this.close());
      body.querySelector('#btn-csv-review').addEventListener('click', () => {
        categories.forEach((cat, index) => {
          const select = body.querySelector(`[data-cat-index="${index}"]`);
          if (!select) return;
          const value = select.value;
          if (value === 'skip') {
            this._mappings[index] = { action: 'skip' };
          } else if (value.startsWith('mapTo:')) {
            this._mappings[index] = { action: 'mapTo', existingCategoryId: value.slice(6) };
          } else {
            this._mappings[index] = { action: 'create' };
          }
        });
        renderStep2();
      });
    };

    const renderStep2 = () => {
      const rows = categories.map((cat, index) => {
        const mapping = this._mappings[index];

        let actionHtml;
        if (mapping.action === 'skip') {
          actionHtml = '<span class="csv-import__badge csv-import__badge--skip">⚪ Ignorada</span>';
        } else if (mapping.action === 'mapTo') {
          const existing = existingCategories.find((existingCategory) => existingCategory.id === mapping.existingCategoryId);
          const label = existing ? escapeHtml(existing.name) : mapping.existingCategoryId;
          actionHtml = `<span class="csv-import__badge csv-import__badge--merge">🔵 Merge com ${label}</span>`;
        } else {
          actionHtml = '<span class="csv-import__badge csv-import__badge--create">🟢 Nova categoria</span>';
        }

        const type = cat.recordType === RecordType.INCOME ? 'Receita' : 'Despesa';
        const records = Object.entries(cat.monthValues)
          .map(([monthKey, value]) => `${formatMonthAbbrev(monthKey)}: ${formatCurrency(value)}`)
          .join('<br>');

        return `
          <tr>
            <td>${actionHtml}</td>
            <td>${escapeHtml(cat.name)}</td>
            <td>${cat.tags.length ? cat.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('') : '—'}</td>
            <td>${type}</td>
            <td>${formatCurrency(cat.idealValue)}</td>
            <td class="csv-import__records">${records || '—'}</td>
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
        this.close();
        onConfirm?.(this._mappings);
      });
    };

    this.replaceContent(wrapper);
    renderStep1();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-csv-import-modal')) {
  customElements.define('dindin-csv-import-modal', DindinCsvImportModal);
}

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
  const modal = document.createElement('dindin-csv-import-modal');
  modal.data = { parsedData, existingCategories, hiddenMonths, onConfirm };
  document.getElementById('modals').appendChild(modal);
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
