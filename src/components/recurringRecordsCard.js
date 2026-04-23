import { formatCurrency } from '../utils/formatters.js';
import { parseFormula } from '../utils/formulaUtils.js';
import RecordType from '../models/RecordType.js';

/**
 * Render a read-only card listing the recurring records for the current month.
 * Returns the card element, or null if there are no recurring records.
 *
 * @param {{
 *   records: object[],
 *   categories: object[],
 * }} options
 * @returns {HTMLElement|null}
 */
function renderRecurringRecordsCard({ records, categories }) {
  if (!records || records.length === 0) return null;

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  let total = 0;
  const rows = records.map((r) => {
    const category = categoryMap.get(r.categoryId);
    const value = parseFormula(String(r.value)) ?? 0;
    const isExpense = category?.recordType === RecordType.EXPENSE;
    total += isExpense ? -value : value;

    const typeIcon = isExpense ? '↑' : '↓';
    const typeClass = isExpense ? 'recurring-card__type--expense' : 'recurring-card__type--income';

    return `
      <li class="recurring-card__item">
        <span class="recurring-card__type ${typeClass}" aria-hidden="true">${typeIcon}</span>
        <span class="recurring-card__name">${escapeHtml(r.name)}</span>
        <span class="recurring-card__category">${escapeHtml(category?.name ?? '—')}</span>
        <span class="recurring-card__value">${formatCurrency(value)}</span>
      </li>
    `;
  }).join('');

  const totalClass = total >= 0 ? 'recurring-card__total--positive' : 'recurring-card__total--negative';

  const card = document.createElement('div');
  card.className = 'recurring-card';
  card.innerHTML = `
    <div class="recurring-card__header">
      <span class="recurring-card__title">Registros Recorrentes</span>
      <span class="recurring-card__count">${records.length} registro${records.length !== 1 ? 's' : ''}</span>
    </div>
    <ul class="recurring-card__list">
      ${rows}
    </ul>
    <div class="recurring-card__footer">
      <span>Saldo recorrente</span>
      <span class="recurring-card__total ${totalClass}">${formatCurrency(Math.abs(total))}</span>
    </div>
  `;

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { renderRecurringRecordsCard };
