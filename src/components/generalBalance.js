import { formatCurrency, formatMonthDisplay, capitalize } from '../utils/formatters.js';
import { computeCategoryBalances, computeGeneralBalance } from '../utils/balanceUtils.js';
import { createCategoryCard } from './categoryCard.js';
import RecordType from '../models/RecordType.js';

function renderGeneralBalance(container, { categories, records, monthKey, onCategoryClick }) {
  const categoryBalances = computeCategoryBalances(categories, records);
  const general = computeGeneralBalance(categoryBalances);

  const expenseBalances = categoryBalances.filter((b) => b.category.recordType === RecordType.EXPENSE);
  const incomeBalances  = categoryBalances.filter((b) => b.category.recordType === RecordType.INCOME);

  const bad      = expenseBalances.filter((b) => b.status === 'red');
  const watchout = expenseBalances.filter((b) => b.status === 'yellow');
  const green    = expenseBalances.filter((b) => b.status === 'green');

  const monthLabel = capitalize(formatMonthDisplay(monthKey));

  const wrapper = document.createElement('div');
  wrapper.className = 'balance-view';

  wrapper.innerHTML = `
    <div class="balance-summary status-bg--${general.status}">
      <p class="balance-summary__month">${monthLabel}</p>
      <p class="balance-summary__label">Saldo</p>
      <p class="balance-summary__value status--${general.status}">
        ${formatCurrency(general.balance)}
      </p>
      <div class="balance-summary__detail">
        <span>Receita Prevista: ${formatCurrency(general.income)}</span>
        <span>Receita Real: ${formatCurrency(general.actualIncome)}</span>
        <span>Despesas: ${formatCurrency(general.expenses)}</span>
      </div>
    </div>
  `;

  if (incomeBalances.length) {
    wrapper.appendChild(buildSection('💰 Receitas', incomeBalances, onCategoryClick));
  }

  if (bad.length) {
    wrapper.appendChild(buildSection('🔴 Ultrapassados', bad, onCategoryClick));
  }

  if (watchout.length) {
    wrapper.appendChild(buildSection('🟡 Atenção', watchout, onCategoryClick));
  }

  if (green.length) {
    wrapper.appendChild(buildSection('🟢 No controle', green, onCategoryClick));
  }

  const bottomBar = document.createElement('div');
  bottomBar.className = 'balance-bottom-bar';
  bottomBar.innerHTML = `
    <button class="btn btn--secondary" id="btn-history">Ver Histórico</button>
    <button class="btn btn--primary" id="btn-finish-month">Encerrar Mês</button>
  `;
  wrapper.appendChild(bottomBar);

  container.innerHTML = '';
  container.appendChild(wrapper);

  return wrapper;
}

function buildSection(title, balances, onCategoryClick) {
  const section = document.createElement('section');
  section.className = 'balance-section';
  const heading = document.createElement('h3');
  heading.className = 'balance-section__title';
  heading.textContent = title;
  section.appendChild(heading);
  balances.forEach((b) => {
    const card = createCategoryCard(b);
    if (onCategoryClick) {
      card.classList.add('category-card--clickable');
      card.addEventListener('click', () => onCategoryClick(b));
    }
    section.appendChild(card);
  });
  return section;
}

export { renderGeneralBalance };
