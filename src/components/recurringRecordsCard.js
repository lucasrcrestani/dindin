import { formatCurrency } from '../utils/formatters.js';
import { parseFormula } from '../utils/formulaUtils.js';
import RecordType from '../models/RecordType.js';
import { BaseComponent } from './baseComponent.js';

/**
 * Splits records into expenses and incomes using the provided category map.
 *
 * @param {object[]} records
 * @param {Map<string, object>} categoryMap
 * @returns {{ expenses: object[], incomes: object[] }}
 */
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

class DindinRecurringRecordsCard extends BaseComponent {
  render() {
    const { records = [], onEdit } = this.data;
    if (!records.length) {
      this.replaceContent();
      return;
    }

    const { expenses, incomes } = splitRecordsByType(records);

    console.group('[Recurring Records Card]');
    console.log('Total:', records.length, 'record(s)');
    expenses.forEach((record) => console.log('  Expense:', record.name, '|', (record.tags ?? []).join(', ') || '—', '|', formatCurrency(parseFormula(String(record.value)) ?? 0)));
    incomes.forEach((record) => console.log('  Income:', record.name, '|', (record.tags ?? []).join(', ') || '—', '|', formatCurrency(parseFormula(String(record.value)) ?? 0)));
    if (expenses.length) console.log('  Total Despesas:', formatCurrency(expenses.reduce((sum, record) => sum + (parseFormula(String(record.value)) ?? 0), 0)));
    if (incomes.length) console.log('  Total Receitas:', formatCurrency(incomes.reduce((sum, record) => sum + (parseFormula(String(record.value)) ?? 0), 0)));
    console.groupEnd();

    const card = document.createElement('div');
    card.className = 'recurring-card';
    card.innerHTML = `
      <div class="recurring-card__header">
        <span class="recurring-card__title">Registros Recorrentes</span>
        <span class="recurring-card__count">${records.length} registro${records.length !== 1 ? 's' : ''}</span>
      </div>
      ${buildSection(expenses, 'Despesas', 'Total Despesas')}
      ${buildSection(incomes, 'Receitas', 'Total Receitas')}
    `;

    card.querySelectorAll('.btn-edit-recurring').forEach((button) => {
      button.addEventListener('click', () => {
        const record = records.find((r) => r.id === button.dataset.id);
        if (record && onEdit) onEdit(record);
      });
    });

    this.className = 'recurring-card-host';
    this.replaceContent(card);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-recurring-records-card')) {
  customElements.define('dindin-recurring-records-card', DindinRecurringRecordsCard);
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
          <button type="button" class="btn btn--sm btn--secondary btn-edit-recurring" data-id="${escapeHtml(record.id)}">Editar</button>
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

/**
 * Render a read-only card listing the recurring records for the current month.
 * Records are grouped into two blocks: Despesas (expenses) then Receitas (incomes).
 * Returns the card element, or null if there are no recurring records.
 *
 * @param {{
 *   records: object[],
 *   categories: object[],
 * }} options
 * @returns {HTMLElement|null}
 */
function renderRecurringRecordsCard({ records, onEdit }) {
  if (!records || records.length === 0) return null;
  const card = document.createElement('dindin-recurring-records-card');
  card.data = { records, onEdit };
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { renderRecurringRecordsCard, splitRecordsByType };
