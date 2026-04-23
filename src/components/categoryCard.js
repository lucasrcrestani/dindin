import { formatCurrency } from '../utils/formatters.js';
import RecordType from '../models/RecordType.js';

const EXPENSE_STATUS_LABEL = { green: 'OK', yellow: 'Atenção', red: 'Ultrapassado' };
const INCOME_STATUS_LABEL  = { green: 'OK', yellow: 'Atenção', red: 'Abaixo' };

/**
 * Creates a category balance card element.
 * @param {import('../utils/balanceUtils.js').CategoryBalance} balance
 * @returns {HTMLElement}
 */
function createCategoryCard(balance) {
  const { category, actual, idealValue, status, historicalAverage } = balance;
  const isIncome = category.recordType === RecordType.INCOME;
  const statusLabel = isIncome ? INCOME_STATUS_LABEL[status] : EXPENSE_STATUS_LABEL[status];

  const card = document.createElement('div');
  card.className = `category-card status-bg--${status}`;
  card.dataset.categoryId = category.id;

  const averageBadge = historicalAverage !== null && historicalAverage !== undefined
    ? `<span class="category-card__average">Média: ${formatCurrency(historicalAverage)}</span>`
    : '';

  card.innerHTML = `
    <div class="category-card__info">
      <span class="category-card__name">${escapeHtml(category.name)}</span>
      <span class="category-card__tags">${(category.tags ?? []).map(escapeHtml).join(', ')}</span>
    </div>
    <div class="category-card__values">
      <span class="category-card__actual status--${status}">${formatCurrency(actual)}</span>
      <span class="category-card__ideal">/ ${formatCurrency(idealValue)}</span>
      ${averageBadge}
    </div>
    <span class="category-card__badge badge--${status}">${statusLabel}</span>
  `;

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { createCategoryCard };
