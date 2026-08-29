import { formatCurrency } from '../utils/formatters.js';
import { parseFormula } from '../utils/formulaUtils.js';
import RecordType from '../models/RecordType.js';
import { BaseComponent } from './baseComponent.js';

function splitRecordsByType(records) {
  const expenses = [];
  const incomes = [];
  for (const r of records) {
    if (r.recordType === RecordType.EXPENSE) {
      expenses.push(r);
    } else {
      incomes.push(r);
    }
  }
  return { expenses, incomes };
}

class DindinUncategorizedRecordsCard extends BaseComponent {
  render() {
    const { records = [], onEdit } = this.data;
    if (!records.length) {
      this.replaceContent();
      return;
    }

    const { expenses, incomes } = splitRecordsByType(records);

    const card = document.createElement('div');
    card.className = 'recurring-card';
    card.innerHTML = `
      <div class="recurring-card__header">
        <span class="recurring-card__title">Registros sem Categoria</span>
        <span class="recurring-card__count">${records.length} registro${records.length !== 1 ? 's' : ''}</span>
      </div>
      ${buildSection(expenses, 'Despesas', 'Total Despesas')}
      ${buildSection(incomes, 'Receitas', 'Total Receitas')}
    `;

    card.querySelectorAll('.btn-edit-uncategorized').forEach((button) => {
      button.addEventListener('click', () => {
        const record = records.find((r) => r.id === button.dataset.id);
        if (record && onEdit) onEdit(record);
      });
    });

    this.className = 'recurring-card-host';
    this.replaceContent(card);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-uncategorized-records-card')) {
  customElements.define('dindin-uncategorized-records-card', DindinUncategorizedRecordsCard);
}

function buildRows(group) {
  return group.map((record) => {
    const value = parseFormula(String(record.value)) ?? 0;
    const isExpense = record.recordType === RecordType.EXPENSE;
    const typeIcon = isExpense ? '↑' : '↓';
    const typeClass = isExpense ? 'recurring-card__type--expense' : 'recurring-card__type--income';
    const tagBadges = (record.tags ?? []).map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('');
    return `
      <li class="recurring-card__item" data-id="${escapeHtml(record.id)}">
        <div class="recurring-card__item-main">
          <span class="recurring-card__type ${typeClass}" aria-hidden="true">${typeIcon}</span>
          <span class="recurring-card__name">${escapeHtml(record.name)}</span>
          <span class="recurring-card__tags">${tagBadges || '<span class="recurring-card__no-tags">—</span>'}</span>
          <span class="recurring-card__value">${formatCurrency(value)}</span>
        </div>
        <div class="recurring-card__actions">
          <button type="button" class="btn btn--sm btn--secondary btn-edit-uncategorized" data-id="${escapeHtml(record.id)}">Editar</button>
        </div>
      </li>
    `;
  }).join('');
}

function buildSection(group, label, footerLabel) {
  if (group.length === 0) return '';
  const subtotal = group.reduce((sum, record) => sum + (parseFormula(String(record.value)) ?? 0), 0);
  const rows = buildRows(group);
  return `
    <div class="recurring-card__section">
      <div class="recurring-card__section-header">${label}</div>
      <ul class="recurring-card__list">
        ${rows}
      </ul>
      <div class="recurring-card__section-footer">
        <span>${footerLabel}</span>
        <span class="recurring-card__total">${formatCurrency(subtotal)}</span>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { renderUncategorizedRecordsCard };

function renderUncategorizedRecordsCard({ records, onEdit }) {
  if (!records || records.length === 0) return null;
  const card = document.createElement('dindin-uncategorized-records-card');
  card.data = { records, onEdit };
  return card;
}
