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

class DindinInstallmentRecordsCard extends BaseComponent {
  render() {
    const { records = [], categories = [], onEdit, onQuitar } = this.data;
    if (!records.length) {
      this.replaceContent();
      return;
    }

    const sorted = [...records].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const groupVisibleCount = new Map();
    for (const record of sorted) {
      const groupId = record.installmentGroupId ?? record.id;
      groupVisibleCount.set(groupId, (groupVisibleCount.get(groupId) ?? 0) + 1);
    }
    const quitarRendered = new Set();
    const { expenses, incomes } = splitRecordsByType(sorted, categoryMap);

    console.group('[Installment Records Card]');
    console.log('Total:', records.length, 'installment(s)');
    expenses.forEach((record) => console.log('  Expense:', record.name, `| Installment ${record.installmentNumber}/${record.installmentTotal} |`, categoryMap.get(record.categoryId)?.name ?? '—', '|', formatCurrency(parseFormula(String(record.value)) ?? 0)));
    incomes.forEach((record) => console.log('  Income:', record.name, `| Installment ${record.installmentNumber}/${record.installmentTotal} |`, categoryMap.get(record.categoryId)?.name ?? '—', '|', formatCurrency(parseFormula(String(record.value)) ?? 0)));
    if (expenses.length) console.log('  Total Despesas:', formatCurrency(expenses.reduce((sum, record) => sum + (parseFormula(String(record.value)) ?? 0), 0)));
    if (incomes.length) console.log('  Total Receitas:', formatCurrency(incomes.reduce((sum, record) => sum + (parseFormula(String(record.value)) ?? 0), 0)));
    console.groupEnd();

    const card = document.createElement('div');
    card.className = 'installment-card';
    card.innerHTML = `
      <div class="installment-card__header">
        <span class="installment-card__title">Parcelas do Mês</span>
        <span class="installment-card__count">${records.length} parcela${records.length !== 1 ? 's' : ''}</span>
      </div>
      ${buildInstallmentSection(expenses, 'Despesas', 'Total Despesas', categoryMap, groupVisibleCount, quitarRendered)}
      ${buildInstallmentSection(incomes, 'Receitas', 'Total Receitas', categoryMap, groupVisibleCount, quitarRendered)}
    `;

    card.querySelectorAll('.btn-edit-installment').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const record = sorted.find((item) => item.id === id);
        if (record && onEdit) onEdit(record);
      });
    });

    card.querySelectorAll('.btn-quitar-installment').forEach((button) => {
      button.addEventListener('click', () => {
        const groupId = button.dataset.groupId;
        if (!groupId) return;
        const record = sorted.find((item) => item.installmentGroupId === groupId);
        const remaining = (record?.installmentTotal ?? 0) - (record?.installmentNumber ?? 0);
        if (remaining <= 0) {
          alert('Não há parcelas futuras para quitar.');
          return;
        }
        if (!confirm(`Quitar as ${remaining} parcela(s) restante(s) e cobrar tudo no mês atual?`)) return;
        if (onQuitar) onQuitar(groupId);
      });
    });

    this.className = 'installment-card-host';
    this.replaceContent(card);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-installment-records-card')) {
  customElements.define('dindin-installment-records-card', DindinInstallmentRecordsCard);
}

function buildInstallmentRows(group, categoryMap, groupVisibleCount, quitarRendered) {
  return group.map((record) => {
    const category = categoryMap.get(record.categoryId);
    const value = parseFormula(String(record.value)) ?? 0;
    const isExpense = category?.recordType === RecordType.EXPENSE;

    const typeIcon = isExpense ? '↑' : '↓';
    const typeClass = isExpense
      ? 'installment-card__type--expense'
      : 'installment-card__type--income';

    const groupId = record.installmentGroupId ?? record.id;
    const visibleCount = groupVisibleCount.get(groupId) ?? 1;
    const hasFuture = visibleCount < (record.installmentTotal ?? 1);
    const showQuitar = hasFuture && !quitarRendered.has(groupId);
    if (showQuitar) quitarRendered.add(groupId);

    const quitarBtn = showQuitar
      ? `<button type="button" class="btn btn--sm btn--danger btn-quitar-installment" data-group-id="${escapeHtml(groupId)}">Quitar</button>`
      : '';

    return `
      <li class="installment-card__item" data-id="${escapeHtml(record.id)}" data-group-id="${escapeHtml(groupId)}">
        <div class="installment-card__item-main">
          <span class="installment-card__type ${typeClass}" aria-hidden="true">${typeIcon}</span>
          <span class="installment-card__name">${escapeHtml(record.name)}</span>
          <span class="installment-card__category">${escapeHtml(category?.name ?? '—')}</span>
          <span class="installment-card__badge">Parcela ${record.installmentNumber}/${record.installmentTotal}</span>
          <span class="installment-card__value">${formatCurrency(value)}</span>
        </div>
        <div class="installment-card__actions">
          <button type="button" class="btn btn--sm btn--secondary btn-edit-installment" data-id="${escapeHtml(record.id)}">Editar</button>
          ${quitarBtn}
        </div>
      </li>
    `;
  }).join('');
}

function buildInstallmentSection(group, label, footerLabel, categoryMap, groupVisibleCount, quitarRendered) {
  if (group.length === 0) return '';
  const subtotal = group.reduce((sum, record) => sum + (parseFormula(String(record.value)) ?? 0), 0);
  const rows = buildInstallmentRows(group, categoryMap, groupVisibleCount, quitarRendered);
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
  const card = document.createElement('dindin-installment-records-card');
  card.data = { records, categories, onEdit, onQuitar };
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { renderInstallmentRecordsCard, splitRecordsByType };
