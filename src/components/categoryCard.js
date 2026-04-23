import { formatCurrency, formatShortMonth } from '../utils/formatters.js';
import RecordType from '../models/RecordType.js';

const EXPENSE_STATUS_LABEL = { green: 'OK', yellow: 'Atenção', red: 'Ultrapassado' };
const INCOME_STATUS_LABEL  = { green: 'OK', yellow: 'Atenção', red: 'Abaixo' };

/**
 * Creates a category balance card element.
 * @param {import('../utils/balanceUtils.js').CategoryBalance} balance
 * @param {{monthKey: string, total: number}[]|null} [monthlyHistory]
 * @returns {HTMLElement}
 */
function createCategoryCard(balance, monthlyHistory) {
  const { category, actual, idealValue, status, historicalAverage } = balance;
  const isIncome = category.recordType === RecordType.INCOME;
  const statusLabel = isIncome ? INCOME_STATUS_LABEL[status] : EXPENSE_STATUS_LABEL[status];
  const hasHistory = Array.isArray(monthlyHistory) && monthlyHistory.length > 0;

  const card = document.createElement('div');
  card.className = `category-card status-bg--${status}${hasHistory ? ' category-card--has-history' : ''}`;
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

  if (hasHistory) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'category-card__expand-btn';
    expandBtn.textContent = '▾';
    expandBtn.setAttribute('aria-label', 'Expandir histórico');
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = card.classList.toggle('category-card--expanded');
      expandBtn.textContent = expanded ? '▴' : '▾';
    });
    card.appendChild(expandBtn);

    const historySection = document.createElement('div');
    historySection.className = 'category-card__history';
    monthlyHistory.forEach(({ monthKey, total }) => {
      const item = document.createElement('div');
      item.className = 'category-card__history-item';
      item.innerHTML = `
        <span class="category-card__history-month">${escapeHtml(formatShortMonth(monthKey))}</span>
        <span class="category-card__history-amount">${formatCurrency(total)}</span>
      `;
      historySection.appendChild(item);
    });
    card.appendChild(historySection);
  }

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { createCategoryCard };
