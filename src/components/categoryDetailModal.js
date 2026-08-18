import { deleteRecord, getRecordsByCategory } from '../services/recordService.js';
import { openAddRecordModal } from './addRecordModal.js';
import { formatCurrency, formatMonthDisplay, capitalize } from '../utils/formatters.js';
import { parseFormula } from '../utils/formulaUtils.js';
import { BaseComponent } from './baseComponent.js';
import { openCategoryModal } from './addCategoryModal.js';


class DindinCategoryDetailModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    console.log('[CategoryDetailModal] connected');
    this._parentNode = this.parentNode;
    this._connectedAt = Date.now();
    requestAnimationFrame(() => {
      console.log('[CategoryDetailModal] showing');
      this.classList.add('modal-overlay--visible');
    });
  }

  disconnectedCallback() {
    console.log('[CategoryDetailModal] disconnected from parent', this._connectedAt ? Date.now() - this._connectedAt : 'n/a');
  }

  close() {
    console.log('[CategoryDetailModal] closing');
    if (this._isClosing) return;
    this._isClosing = true;
    this.classList.remove('modal-overlay--visible');
    this.classList.add('modal-overlay--closing');
    this.remove();
    console.log('[CategoryDetailModal] removed');
  }

  async render() {
    const {
      category,
      month,
      allCategories = [],
      commonRecordNames = [],
      settings,
      onChanged,
    } = this.data;

    if (!category || !month) {
      this.replaceContent();
      return;
    }

    if (!this._categoryRecordsLoaded) {
      const matchedRecords = await getRecordsByCategory(category.id);
      this._categoryRecords = matchedRecords.filter((record) => record.month === month);
      this._categoryRecordsLoaded = true;
    }

    const monthLabel = capitalize(formatMonthDisplay(month));
    this.className = 'modal-overlay';
    this._isClosing = false;

    const wrapper = document.createElement('div');
    wrapper.className = 'modal-overlay__content';
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
            <button class="btn btn--secondary btn--sm record-list__edit" id="btn-edit-category" aria-label="Editar categoria">✏️ Editar categoria</button>
            <button class="btn btn--primary" id="btn-detail-add">+ Adicionar Lançamento</button>
          </div>
        </div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
    });
    this.addEventListener('click', (event) => {
      const path = event.composedPath();
      if (path[0] === this) {
        event.stopPropagation();
        this.close();
      }
    });

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
        const tagsHtml = record.tags?.length
          ? `<span class="record-list__tags">${record.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}</span>`
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
            initial: { ...record, lockedTags: category.tags ?? [] },
            preselectedRecordType: category.recordType,
            inheritedTags: category.tags ?? [],
            lockRecordType: true,
            onSaved: (updated) => {
              this._categoryRecords = this._categoryRecords.map((item) => item.id === updated.id ? updated : item);
              renderList();
            },
          });
        });

        li.querySelector('.record-list__delete').addEventListener('click', async () => {
          if (!confirm(`Excluir "${record.name}"?`)) return;
          console.log('[Category Detail] Deleting record:', record.name, '|', record.id);
          await deleteRecord(record.id);
          this._categoryRecords = this._categoryRecords.filter((item) => item.id !== record.id);
          renderList();
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
        preselectedRecordType: category.recordType,
        inheritedTags: category.tags ?? [],
        lockRecordType: true,
        onSaved: (record) => {
          this._categoryRecords = [...this._categoryRecords, record];
          renderList();
        },
      });
    });

    wrapper.querySelector('#btn-edit-category').addEventListener('click', () => {
      console.log('[Category Detail] Editing category:', category.name);
      openCategoryModal({
        initial: category,
        onSaved: async () => {
          onChanged?.();
          await this.render();
        },
      });
    });

    this.replaceContent(wrapper);
    requestAnimationFrame(() => {
      this.classList.add('modal-overlay--visible');
      wrapper.classList.add('modal-overlay__content--visible');
    });
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
  console.log('[CategoryDetailModal] opening', category?.name, 'month', month);
  const modal = document.createElement('dindin-category-detail-modal');
  modal.data = { category, month, records, allCategories, commonRecordNames, settings, onChanged };
  const parent = document.getElementById('modals');
  parent.appendChild(modal);
  console.log('[CategoryDetailModal] appended to container', parent.childElementCount);
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
