import { formatMonthLabel } from '../utils/dateUtils.js';
import { getRecordsByMonth, getAllMonthsWithRecords } from '../services/recordService.js';
import { getAllCommonRecordNames } from '../services/commonRecordNameService.js';
import { renderGeneralBalance } from './generalBalance.js';
import { openCategoryDetailModal } from './categoryDetailModal.js';
import { BaseComponent } from './baseComponent.js';

class DindinHistoryModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  async render() {
    const { categories = [], settings } = this.data;
    const currentMonth = settings?.currentMonth;
    if (!currentMonth) {
      this.replaceContent();
      return;
    }

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-hist-title">
        <div class="modal__header">
          <h2 id="modal-hist-title" class="modal__title">Histórico</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body" id="history-body"></div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    this.onclick = (event) => {
      if (event.target === this) this.close();
    };

    const body = wrapper.querySelector('#history-body');

    const showMonthList = async () => {
      body.innerHTML = '';
      const allMonths = await getAllMonthsWithRecords();
      const months = allMonths.filter((month) => month !== currentMonth).reverse();

      if (months.length === 0) {
        body.innerHTML = '<p class="text-muted">Nenhum lançamento registrado ainda.</p>';
        return;
      }

      const byYear = new Map();
      months.forEach((month) => {
        const year = month.slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(month);
      });

      byYear.forEach((yearMonths, year) => {
        const section = document.createElement('div');
        section.className = 'history-year-section';

        const heading = document.createElement('h3');
        heading.className = 'history-year-heading';
        heading.textContent = year;
        section.appendChild(heading);

        const list = document.createElement('ul');
        list.className = 'history-month-list';
        yearMonths.forEach((month) => {
          const item = document.createElement('li');
          item.className = 'history-month-item';
          const button = document.createElement('button');
          button.className = 'btn btn--secondary history-month-btn';
          button.textContent = capitalize(formatMonthLabel(month));
          button.addEventListener('click', () => showMonthBalance(month));
          item.appendChild(button);
          list.appendChild(item);
        });
        section.appendChild(list);
        body.appendChild(section);
      });
    };

    const showMonthBalance = async (month) => {
      console.log('[History Modal] Viewing month:', month);
      const [records, commonRecordNameEntries] = await Promise.all([
        getRecordsByMonth(month),
        getAllCommonRecordNames(),
      ]);
      const commonRecordNames = commonRecordNameEntries.map((entry) => entry.name);

      body.innerHTML = '';

      const backButton = document.createElement('button');
      backButton.className = 'btn btn--secondary';
      backButton.style.marginBottom = '12px';
      backButton.textContent = '← Voltar';
      backButton.addEventListener('click', showMonthList);
      body.appendChild(backButton);

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
    };

    this.replaceContent(wrapper);
    await showMonthList();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-history-modal')) {
  customElements.define('dindin-history-modal', DindinHistoryModal);
}

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
  const modal = document.createElement('dindin-history-modal');
  modal.data = { categories, settings };
  document.getElementById('modals').appendChild(modal);
}


function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { openHistoryModal };
