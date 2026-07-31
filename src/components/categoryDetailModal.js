import { deleteRecord } from '../services/recordService.js';
import { openAddRecordModal } from './addRecordModal.js';
import { formatCurrency, formatMonthDisplay, capitalize } from '../utils/formatters.js';
import { parseFormula } from '../utils/formulaUtils.js';
import { BaseComponent } from './baseComponent.js';

class DindinCategoryDetailModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  render() {
    const {
      category,
      month,
      records = [],
      allCategories = [],
      commonRecordNames = [],
      settings,
      onChanged,
    } = this.data;

    if (!category || !month) {
      this.replaceContent();
      return;
    }

    if (!this._categoryRecords) {
      this._categoryRecords = records.filter((record) => record.categoryId === category.id);
    }

    const monthLabel = capitalize(formatMonthDisplay(month));
    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-detail-title">
        <div class="modal__header">
          <h2 id="modal-detail-title" class="modal__title">${escapeHtml(category.name)}</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">
          <p class="modal-detail__month">${monthLabel}</p>
          <div id="detail-record-list"></div>
          <div class="modal__footer">
            <button class="btn btn--primary" id="btn-detail-add">+ Adicionar Lançamento</button>
          </div>
        </div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    this.onclick = (event) => {
      if (event.target === this) this.close();
    };

    const renderList = () => {
      const listContainer = wrapper.querySelector('#detail-record-list');
      listContainer.innerHTML = '';

      const sorted = [...this._categoryRecords].sort((left, right) => {
        const dateDiff = right.date.localeCompare(left.date);
        if (dateDiff !== 0) return dateDiff;
        return left.createdAt.localeCompare(right.createdAt);
      });

      console.group(`[Category Detail] ${category.name} — ${monthLabel}`);
      console.log('Record count:', sorted.length);
      sorted.forEach((record) => console.log(`  ${record.date} | ${record.name} | ${formatCurrency(parseFormula(record.value) ?? 0)}`));
      console.groupEnd();

      if (sorted.length === 0) {
        listContainer.innerHTML = '<p class="record-list__empty">Nenhum lançamento neste mês.</p>';
        return;
      }

      const ul = document.createElement('ul');
      ul.className = 'record-list';

      sorted.forEach((record) => {
        const li = document.createElement('li');
        li.className = 'record-list__item';
        const effectiveTags = [...new Set([...(category.tags ?? []), ...(record.tags ?? [])])];
        const tagsHtml = effectiveTags.length
          ? `<span class="record-list__tags">${effectiveTags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}</span>`
          : '';
        li.innerHTML = `
          <span class="record-list__date">${formatDate(record.date)}</span>
          <span class="record-list__name">${escapeHtml(record.name)}</span>
          <span class="record-list__value">${formatCurrency(parseFormula(record.value) ?? 0)}</span>
          <button class="btn btn--secondary btn--sm record-list__edit" aria-label="Editar lançamento">✏️</button>
          <button class="btn btn--danger btn--sm record-list__delete" aria-label="Excluir lançamento">✕</button>
          ${tagsHtml}
        `;

        li.querySelector('.record-list__edit').addEventListener('click', () => {
          console.log('[Category Detail] Opening edit for record:', record.name, '|', record.id);
          openAddRecordModal({
            categories: allCategories,
            commonRecordNames,
            settings,
            initial: record,
            onSaved: (updated) => {
              this._categoryRecords = this._categoryRecords.map((item) => item.id === updated.id ? updated : item);
              renderList();
              if (onChanged) onChanged();
            },
          });
        });

        li.querySelector('.record-list__delete').addEventListener('click', async () => {
          if (!confirm(`Excluir "${record.name}"?`)) return;
          console.log('[Category Detail] Deleting record:', record.name, '|', record.id);
          await deleteRecord(record.id);
          this._categoryRecords = this._categoryRecords.filter((item) => item.id !== record.id);
          renderList();
          if (onChanged) onChanged();
        });

        ul.appendChild(li);
      });

      const total = this._categoryRecords.reduce((sum, record) => sum + (parseFormula(record.value) ?? 0), 0);
      const totalLi = document.createElement('li');
      totalLi.className = 'record-list__total';
      totalLi.innerHTML = `
        <span>Total</span>
        <span>${formatCurrency(total)}</span>
      `;
      ul.appendChild(totalLi);

      listContainer.appendChild(ul);
    };

    wrapper.querySelector('#btn-detail-add').addEventListener('click', () => {
      console.log('[Category Detail] Opening add record for category:', category.name);
      openAddRecordModal({
        categories: allCategories,
        commonRecordNames,
        settings,
        preselectedCategoryId: category.id,
        onSaved: (record) => {
          this._categoryRecords = [...this._categoryRecords, record];
          renderList();
          if (onChanged) onChanged();
        },
      });
    });

    this.replaceContent(wrapper);
    renderList();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-category-detail-modal')) {
  customElements.define('dindin-category-detail-modal', DindinCategoryDetailModal);
}

/**
 * Opens the category detail modal showing all records of a category for a given month.
 * @param {{
 *   category: object,
 *   month: string,
 *   records: object[],
 *   allCategories: object[],
 *   commonRecordNames: string[],
 *   settings: object,
 *   onChanged: () => void,
 * }} options
 */
function openCategoryDetailModal({ category, month, records, allCategories, commonRecordNames, settings, onChanged }) {
  const modal = document.createElement('dindin-category-detail-modal');
  modal.data = { category, month, records, allCategories, commonRecordNames, settings, onChanged };
  document.getElementById('modals').appendChild(modal);
}

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { openCategoryDetailModal };
