import { formatCurrency } from '../utils/formatters.js';
import { parseFormula } from '../utils/formulaUtils.js';
import RecordType from '../models/RecordType.js';

/**
 * Splits records into expenses and incomes using the provided category map.
 *
 * @param {object[]} records
 * @param {Map<string, object>} categoryMap
 * @returns {{ expenses: object[], incomes: object[] }}
 */
function splitRecordsByType(records, categoryMap) {
  const expenses = [];
  const incomes = [];
  for (const r of records) {
    const category = categoryMap.get(r.categoryId);
    if (category?.recordType === RecordType.EXPENSE) {
      expenses.push(r);
    } else {
      incomes.push(r);
    }
  }
  return { expenses, incomes };
}

/**
 * Render a card listing all installment records for the current month.
 * Records are grouped into two blocks: Despesas (expenses) then Receitas (incomes).
 * Returns the card element, or null if there are no installment records.
 *
 * @param {{
 *   records: object[],
 *   categories: object[],
 *   onEdit: (record: object) => void,
 *   onQuitar: (groupId: string) => void,
 * }} options
 * @returns {HTMLElement|null}
 */
function renderInstallmentRecordsCard({ records, categories, onEdit, onQuitar }) {
  if (!records || records.length === 0) return null;

  const sorted = [...records].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // For each group, count how many installments are already in this month's list.
  // Quitar is only relevant when visibleCount < installmentTotal (future records still exist).
  // Show the Quitar button only once per group — on the record with the lowest installmentNumber.
  const groupVisibleCount = new Map();
  for (const r of sorted) {
    const gid = r.installmentGroupId ?? r.id;
    groupVisibleCount.set(gid, (groupVisibleCount.get(gid) ?? 0) + 1);
  }
  // Track which groups have already had their Quitar button rendered
  const quitarRendered = new Set();

  const { expenses, incomes } = splitRecordsByType(sorted, categoryMap);

  console.group('[Installment Records Card]');
  console.log('Total:', records.length, 'installment(s)');
  expenses.forEach((r) => console.log('  Expense:', r.name, `| Installment ${r.installmentNumber}/${r.installmentTotal} |`, categoryMap.get(r.categoryId)?.name ?? '—', '|', formatCurrency(parseFormula(String(r.value)) ?? 0)));
  incomes.forEach((r) => console.log('  Income:', r.name, `| Installment ${r.installmentNumber}/${r.installmentTotal} |`, categoryMap.get(r.categoryId)?.name ?? '—', '|', formatCurrency(parseFormula(String(r.value)) ?? 0)));
  if (expenses.length) console.log('  Total Despesas:', formatCurrency(expenses.reduce((s, r) => s + (parseFormula(String(r.value)) ?? 0), 0)));
  if (incomes.length) console.log('  Total Receitas:', formatCurrency(incomes.reduce((s, r) => s + (parseFormula(String(r.value)) ?? 0), 0)));
  console.groupEnd();

  function buildRows(group) {
    return group.map((r) => {
      const category = categoryMap.get(r.categoryId);
      const value = parseFormula(String(r.value)) ?? 0;
      const isExpense = category?.recordType === RecordType.EXPENSE;

      const typeIcon = isExpense ? '↑' : '↓';
      const typeClass = isExpense
        ? 'installment-card__type--expense'
        : 'installment-card__type--income';

      const gid = r.installmentGroupId ?? r.id;
      const visibleCount = groupVisibleCount.get(gid) ?? 1;
      const hasFuture = visibleCount < (r.installmentTotal ?? 1);
      const showQuitar = hasFuture && !quitarRendered.has(gid);
      if (showQuitar) quitarRendered.add(gid);

      const quitarBtn = showQuitar
        ? `<button type="button" class="btn btn--sm btn--danger btn-quitar-installment" data-group-id="${escapeHtml(gid)}">Quitar</button>`
        : '';

      return `
        <li class="installment-card__item" data-id="${escapeHtml(r.id)}" data-group-id="${escapeHtml(gid)}">
          <div class="installment-card__item-main">
            <span class="installment-card__type ${typeClass}" aria-hidden="true">${typeIcon}</span>
            <span class="installment-card__name">${escapeHtml(r.name)}</span>
            <span class="installment-card__category">${escapeHtml(category?.name ?? '—')}</span>
            <span class="installment-card__badge">Parcela ${r.installmentNumber}/${r.installmentTotal}</span>
            <span class="installment-card__value">${formatCurrency(value)}</span>
          </div>
          <div class="installment-card__actions">
            <button type="button" class="btn btn--sm btn--secondary btn-edit-installment" data-id="${escapeHtml(r.id)}">Editar</button>
            ${quitarBtn}
          </div>
        </li>
      `;
    }).join('');
  }

  function buildSection(group, label, footerLabel) {
    if (group.length === 0) return '';
    const subtotal = group.reduce((sum, r) => sum + (parseFormula(String(r.value)) ?? 0), 0);
    const rows = buildRows(group);
    return `
      <div class="installment-card__section">
        <div class="installment-card__section-header">${label}</div>
        <ul class="installment-card__list">
          ${rows}
        </ul>
        <div class="installment-card__section-footer">
          <span>${footerLabel}</span>
          <span class="installment-card__total">${formatCurrency(subtotal)}</span>
        </div>
      </div>
    `;
  }

  const expensesSection = buildSection(expenses, 'Despesas', 'Total Despesas');
  const incomesSection = buildSection(incomes, 'Receitas', 'Total Receitas');

  const card = document.createElement('div');
  card.className = 'installment-card';
  card.innerHTML = `
    <div class="installment-card__header">
      <span class="installment-card__title">Parcelas do Mês</span>
      <span class="installment-card__count">${records.length} parcela${records.length !== 1 ? 's' : ''}</span>
    </div>
    ${expensesSection}
    ${incomesSection}
  `;

  // Wire up edit buttons
  card.querySelectorAll('.btn-edit-installment').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const record = sorted.find((r) => r.id === id);
      if (record) onEdit(record);
    });
  });

  // Wire up quitar buttons
  card.querySelectorAll('.btn-quitar-installment').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.groupId;
      if (!groupId) return;
      const record = sorted.find((r) => r.installmentGroupId === groupId);
      const remaining = (record?.installmentTotal ?? 0) - (record?.installmentNumber ?? 0);
      if (remaining <= 0) {
        alert('Não há parcelas futuras para quitar.');
        return;
      }
      if (!confirm(`Quitar as ${remaining} parcela(s) restante(s) e cobrar tudo no mês atual?`)) return;
      onQuitar(groupId);
    });
  });

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { renderInstallmentRecordsCard, splitRecordsByType };
