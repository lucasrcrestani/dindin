import { formatCurrency, formatMonthDisplay, capitalize, formatShortDate } from '../utils/formatters.js';
import { computeCategoryBalances, computeGeneralBalance } from '../utils/balanceUtils.js';
import { createCategoryCard } from './categoryCard.js';
import RecordType from '../models/RecordType.js';

function renderGeneralBalance(container, { categories, records, monthKey, categoryAverages, categoryMonthlyTotals, onCategoryClick }) {
  const categoryBalances = computeCategoryBalances(categories, records).map((b) => ({
    ...b,
    historicalAverage: categoryAverages?.get(b.category.id) ?? null,
  }));
  const general = computeGeneralBalance(categoryBalances);

  const expenseBalances = categoryBalances.filter((b) => b.category.recordType === RecordType.EXPENSE);
  const incomeBalances  = categoryBalances.filter((b) => b.category.recordType === RecordType.INCOME);

  const bad      = expenseBalances.filter((b) => b.status === 'red');
  const watchout = expenseBalances.filter((b) => b.status === 'yellow');
  const green    = expenseBalances.filter((b) => b.status === 'green');

  const monthLabel = capitalize(formatMonthDisplay(monthKey));

  const lastRecord = records.length
    ? records.reduce((latest, r) => (r.date > latest.date ? r : latest))
    : null;
  const lastDateLabel = lastRecord ? formatShortDate(lastRecord.date) : null;

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
      ${lastDateLabel ? `<p class="balance-summary__last-record">Último registro: ${lastDateLabel}</p>` : ''}
    </div>
  `;

  if (incomeBalances.length) {
    wrapper.appendChild(buildSection('💰 Receitas', incomeBalances, onCategoryClick, categoryMonthlyTotals));
  }

  if (bad.length) {
    wrapper.appendChild(buildSection('🔴 Ultrapassados', bad, onCategoryClick, categoryMonthlyTotals));
  }

  if (watchout.length) {
    wrapper.appendChild(buildSection('🟡 Atenção', watchout, onCategoryClick, categoryMonthlyTotals));
  }

  if (green.length) {
    wrapper.appendChild(buildSection('🟢 No controle', green, onCategoryClick, categoryMonthlyTotals));
  }

  const hasAnyHistory = categoryMonthlyTotals &&
    Array.from(categoryMonthlyTotals.values()).some((arr) => arr && arr.length > 0);

  if (hasAnyHistory) {
    const expandBar = document.createElement('div');
    expandBar.className = 'balance-expand-bar';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'balance-expand-bar__btn';
    expandBtn.textContent = '▾ Expandir histórico';
    expandBar.appendChild(expandBtn);
    wrapper.insertBefore(expandBar, wrapper.querySelector('.balance-section') ?? wrapper.querySelector('.balance-bottom-bar'));

    let isExpanded = false;
    expandBtn.addEventListener('click', () => {
      isExpanded = !isExpanded;
      expandBtn.textContent = isExpanded ? '▴ Recolher histórico' : '▾ Expandir histórico';
      wrapper.querySelectorAll('.category-card--has-history').forEach((card) => {
        card.classList.toggle('category-card--expanded', isExpanded);
        const btn = card.querySelector('.category-card__expand-btn');
        if (btn) btn.textContent = isExpanded ? '▴' : '▾';
      });
    });
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

function buildSection(title, balances, onCategoryClick, categoryMonthlyTotals) {
  const section = document.createElement('section');
  section.className = 'balance-section';
  const heading = document.createElement('h3');
  heading.className = 'balance-section__title';
  heading.textContent = title;
  section.appendChild(heading);
  balances.forEach((b) => {
    const monthlyHistory = categoryMonthlyTotals?.get(b.category.id) ?? null;
    const card = createCategoryCard(b, monthlyHistory);
    if (onCategoryClick) {
      card.classList.add('category-card--clickable');
      card.addEventListener('click', () => onCategoryClick(b));
    }
    section.appendChild(card);
  });
  return section;
}

export { renderGeneralBalance };
