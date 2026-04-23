import { formatMonthLabel } from '../utils/dateUtils.js';
import { getRecordsByMonth, getAllMonthsWithRecords } from '../services/recordService.js';
import { getAllCommonRecordNames } from '../services/commonRecordNameService.js';
import { renderGeneralBalance } from './generalBalance.js';
import { openCategoryDetailModal } from './categoryDetailModal.js';

/**
 * Opens the history modal: lists past months, then shows balance for selected month.
 * @param {{
 *   categories: object[],
 *   settings: object,
 * }} props
 */
function openHistoryModal({ categories, settings }) {
  const { currentMonth } = settings;
  if (!currentMonth) {
    alert('Nenhum mês registrado ainda.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-hist-title">
      <div class="modal__header">
        <h2 id="modal-hist-title" class="modal__title">Histórico</h2>
        <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal__body" id="history-body"></div>
    </div>
  `;

  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const close = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const body = overlay.querySelector('#history-body');

  async function showMonthList() {
    body.innerHTML = '';
    const allMonths = await getAllMonthsWithRecords();
    const months = allMonths.filter((m) => m !== currentMonth).reverse();

    if (months.length === 0) {
      body.innerHTML = '<p class="text-muted">Nenhum lançamento registrado ainda.</p>';
      return;
    }

    // Group by year
    const byYear = new Map();
    months.forEach((m) => {
      const year = m.slice(0, 4);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(m);
    });

    byYear.forEach((yearMonths, year) => {
      const section = document.createElement('div');
      section.className = 'history-year-section';

      const heading = document.createElement('h3');
      heading.className = 'history-year-heading';
      heading.textContent = year;
      section.appendChild(heading);

      const ul = document.createElement('ul');
      ul.className = 'history-month-list';
      yearMonths.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'history-month-item';
        const btn = document.createElement('button');
        btn.className = 'btn btn--secondary history-month-btn';
        btn.textContent = capitalize(formatMonthLabel(m));
        btn.addEventListener('click', () => showMonthBalance(m));
        li.appendChild(btn);
        ul.appendChild(li);
      });
      section.appendChild(ul);
      body.appendChild(section);
    });
  }

  async function showMonthBalance(month) {
    const [records, commonRecordNameEntries] = await Promise.all([
      getRecordsByMonth(month),
      getAllCommonRecordNames(),
    ]);
    const commonRecordNames = commonRecordNameEntries.map((e) => e.name);

    body.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn--secondary';
    backBtn.style.marginBottom = '12px';
    backBtn.textContent = '← Voltar';
    backBtn.addEventListener('click', showMonthList);
    body.appendChild(backBtn);

    const container = document.createElement('div');
    body.appendChild(container);
    renderGeneralBalance(container, {
      categories,
      records,
      monthKey: month,
      onCategoryClick: (balance) => openCategoryDetailModal({
        category: balance.category,
        month,
        records,
        allCategories: categories,
        commonRecordNames,
        settings,
        onChanged: () => showMonthBalance(month),
      }),
    });

    container.querySelector('#btn-finish-month')?.remove();
    container.querySelector('#btn-history')?.remove();
  }

  showMonthList();
}


function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { openHistoryModal };
