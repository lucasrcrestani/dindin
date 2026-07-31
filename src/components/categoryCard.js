import { formatCurrency, formatShortMonth } from '../utils/formatters.js';
import RecordType from '../models/RecordType.js';
import { BaseComponent } from './baseComponent.js';

const EXPENSE_STATUS_LABEL = { green: 'OK', yellow: 'Atenção', red: 'Ultrapassado' };
const INCOME_STATUS_LABEL  = { green: 'OK', yellow: 'Atenção', red: 'Abaixo' };

class DindinCategoryCard extends BaseComponent {
  constructor() {
    super();
    this._expanded = false;
  }

  setExpanded(expanded) {
    this._expanded = Boolean(expanded);
    this.classList.toggle('category-card--expanded', this._expanded);
    const expandButton = this.shadowRoot.querySelector('.category-card__expand-btn');
    if (expandButton) {
      expandButton.textContent = this._expanded ? '▴' : '▾';
    }
  }

  render() {
    const { balance, monthlyHistory = null } = this.data;
    if (!balance) {
      this.replaceContent();
      return;
    }

    const { category, actual, idealValue, status, historicalAverage } = balance;
    const isIncome = category.recordType === RecordType.INCOME;
    const statusLabel = isIncome ? INCOME_STATUS_LABEL[status] : EXPENSE_STATUS_LABEL[status];
    const hasHistory = Array.isArray(monthlyHistory) && monthlyHistory.length > 0;

    this.className = `category-card status-bg--${status}${hasHistory ? ' category-card--has-history' : ''}`;
    this.classList.toggle('category-card--expanded', this._expanded && hasHistory);
    this.dataset.categoryId = category.id;

    const container = document.createElement('span');
    container.style.justifyContent = 'space-between';
    container.style.alignItems = 'center';
    container.style.width = '100%';
    container.style.display = 'flex';
    container.classList.add('category-card');
    container.style.padding = '0';
    this._contentRoot.style.display = 'flex';
    this._contentRoot.style.justifyContent = 'space-between';
    this._contentRoot.style.alignItems = 'center';
    this._contentRoot.style.width = '100%';

    const averageBadge = historicalAverage !== null && historicalAverage !== undefined
      ? `<span class="category-card__average">Média: ${formatCurrency(historicalAverage)}</span>`
      : '';

    container.innerHTML = `
      <div class="category-card__info">
        <span class="category-card__name">${escapeHtml(category.name)}</span>
        <span class="category-card__tags">${(category.tags ?? []).map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}</span>
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
      expandBtn.textContent = this._expanded ? '▴' : '▾';
      expandBtn.setAttribute('aria-label', 'Expandir histórico');
      expandBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.setExpanded(!this._expanded);
      });
      container.appendChild(expandBtn);

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
      container.appendChild(historySection);
    }

    this.replaceContent(container);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-category-card')) {
  customElements.define('dindin-category-card', DindinCategoryCard);
}

/**
 * Creates a category balance card element.
 * @param {import('../utils/balanceUtils.js').CategoryBalance} balance
 * @param {{monthKey: string, total: number}[]|null} [monthlyHistory]
 * @returns {HTMLElement}
 */
function createCategoryCard(balance, monthlyHistory) {
  const card = document.createElement('dindin-category-card');
  card.data = { balance, monthlyHistory };
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { createCategoryCard };
