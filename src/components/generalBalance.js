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

  console.group(`[General Balance] ${monthLabel}`);
  console.log('Receita Prevista:', formatCurrency(general.income));
  console.log('Receita Real:', formatCurrency(general.actualIncome));
  console.log('Despesas:', formatCurrency(general.expenses));
  console.log('Saldo:', formatCurrency(general.balance), `(status: ${general.status})`);
  if (lastRecord) console.log('Último registro:', lastRecord.name, '|', lastRecord.date);
  if (incomeBalances.length) {
    console.group('💰 Receitas');
    incomeBalances.forEach((b) => console.log(`  ${b.category.name}: ${formatCurrency(b.actual)} / ${formatCurrency(b.idealValue)} (${b.status})`));
    console.groupEnd();
  }
  if (bad.length) {
    console.group('🔴 Ultrapassados');
    bad.forEach((b) => console.log(`  ${b.category.name}: ${formatCurrency(b.actual)} / ${formatCurrency(b.idealValue)}`));
    console.groupEnd();
  }
  if (watchout.length) {
    console.group('🟡 Atenção');
    watchout.forEach((b) => console.log(`  ${b.category.name}: ${formatCurrency(b.actual)} / ${formatCurrency(b.idealValue)}`));
    console.groupEnd();
  }
  if (green.length) {
    console.group('🟢 No controle');
    green.forEach((b) => console.log(`  ${b.category.name}: ${formatCurrency(b.actual)} / ${formatCurrency(b.idealValue)}`));
    console.groupEnd();
  }
  console.groupEnd();

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
    wrapper.appendChild(buildSection('💰 Receitas', incomeBalances, onCategoryClick, categoryMonthlyTotals, records));
  }

  if (bad.length) {
    wrapper.appendChild(buildSection('🔴 Ultrapassados', bad, onCategoryClick, categoryMonthlyTotals, records));
  }

  if (watchout.length) {
    wrapper.appendChild(buildSection('🟡 Atenção', watchout, onCategoryClick, categoryMonthlyTotals, records));
  }

  if (green.length) {
    wrapper.appendChild(buildSection('🟢 No controle', green, onCategoryClick, categoryMonthlyTotals, records));
  }

  const hasAnyHistory = categoryMonthlyTotals &&
    Array.from(categoryMonthlyTotals.values()).some((arr) => arr && arr.length > 0);

  // ─── Tag filter bar ────────────────────────────────────────────────────────
  const allTags = [...new Set([
    ...categories.flatMap(c => c.tags ?? []),
    ...records.flatMap(r => r.tags ?? []),
  ])];

  if (allTags.length > 0) {
    const filterBar = document.createElement('div');
    filterBar.className = 'balance-tag-filter';
    filterBar.innerHTML = `<span class="balance-tag-filter__label">Filtrar por tag:</span>`;
    allTags.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-badge tag-badge--filter';
      btn.dataset.tag = tag;
      btn.textContent = tag;
      btn.addEventListener('click', () => {
        const isActive = btn.classList.toggle('tag-badge--active');
        applyTagFilter(wrapper, records, isActive ? tag : null);
        console.log('[Tag Filter] Tag selecionada:', isActive ? tag : '(limpo)');
      });
      filterBar.appendChild(btn);
    });
    wrapper.insertBefore(filterBar, wrapper.querySelector('.balance-section'));
  }
  // ──────────────────────────────────────────────────────────────────────────

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

function buildSection(title, balances, onCategoryClick, categoryMonthlyTotals, records) {
  const section = document.createElement('section');
  section.className = 'balance-section';
  const heading = document.createElement('h3');
  heading.className = 'balance-section__title';
  heading.textContent = title;
  section.appendChild(heading);
  balances.forEach((b) => {
    const monthlyHistory = categoryMonthlyTotals?.get(b.category.id) ?? null;
    const card = createCategoryCard(b, monthlyHistory);
    // Compute effective tags: category tags ∪ record tags for this category
    const recordTags = (records ?? [])
      .filter(r => r.categoryId === b.category.id)
      .flatMap(r => r.tags ?? []);
    const effectiveTags = [...new Set([...(b.category.tags ?? []), ...recordTags])];
    card.dataset.tags = JSON.stringify(effectiveTags);
    if (onCategoryClick) {
      card.classList.add('category-card--clickable');
      card.addEventListener('click', () => onCategoryClick(b));
    }
    section.appendChild(card);
  });
  return section;
}

function applyTagFilter(wrapper, records, tag) {
  wrapper.querySelectorAll('.balance-tag-filter .tag-badge--filter').forEach(btn => {
    if (btn.dataset.tag !== tag) btn.classList.remove('tag-badge--active');
  });
  wrapper.querySelectorAll('.balance-section').forEach(section => {
    let visibleCount = 0;
    section.querySelectorAll('.category-card').forEach(card => {
      if (!tag) {
        card.style.display = '';
        visibleCount++;
      } else {
        const cardTags = JSON.parse(card.dataset.tags ?? '[]');
        const visible = cardTags.includes(tag);
        card.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
      }
    });
    section.style.display = visibleCount === 0 ? 'none' : '';
  });
}

export { renderGeneralBalance };
