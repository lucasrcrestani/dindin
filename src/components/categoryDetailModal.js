import { deleteRecord } from '../services/recordService.js';
import { openAddRecordModal } from './addRecordModal.js';
import { formatCurrency, formatMonthDisplay, capitalize } from '../utils/formatters.js';

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
  let categoryRecords = records.filter((r) => r.categoryId === category.id);

  const monthLabel = capitalize(formatMonthDisplay(month));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
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

  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const close = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  function renderList() {
    const listContainer = overlay.querySelector('#detail-record-list');
    listContainer.innerHTML = '';

    const sorted = [...categoryRecords].sort((a, b) => b.date.localeCompare(a.date));

    if (sorted.length === 0) {
      listContainer.innerHTML = '<p class="record-list__empty">Nenhum lançamento neste mês.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'record-list';

    sorted.forEach((rec) => {
      const li = document.createElement('li');
      li.className = 'record-list__item';
      li.innerHTML = `
        <span class="record-list__date">${formatDate(rec.date)}</span>
        <span class="record-list__name">${escapeHtml(rec.name)}</span>
        <span class="record-list__value">${formatCurrency(rec.value)}</span>
        <button class="btn btn--secondary btn--sm record-list__edit" aria-label="Editar lançamento">✏️</button>
        <button class="btn btn--danger btn--sm record-list__delete" aria-label="Excluir lançamento">✕</button>
      `;

      li.querySelector('.record-list__edit').addEventListener('click', () => {
        openAddRecordModal({
          categories: allCategories,
          commonRecordNames,
          settings,
          initial: rec,
          onSaved: (updated) => {
            categoryRecords = categoryRecords.map((r) => r.id === updated.id ? updated : r);
            renderList();
            onChanged();
          },
        });
      });

      li.querySelector('.record-list__delete').addEventListener('click', async () => {
        if (!confirm(`Excluir "${rec.name}"?`)) return;
        await deleteRecord(rec.id);
        categoryRecords = categoryRecords.filter((r) => r.id !== rec.id);
        renderList();
        onChanged();
      });

      ul.appendChild(li);
    });

    const total = categoryRecords.reduce((sum, r) => sum + r.value, 0);
    const totalLi = document.createElement('li');
    totalLi.className = 'record-list__total';
    totalLi.innerHTML = `
      <span>Total</span>
      <span>${formatCurrency(total)}</span>
    `;
    ul.appendChild(totalLi);

    listContainer.appendChild(ul);
  }

  overlay.querySelector('#btn-detail-add').addEventListener('click', () => {
    openAddRecordModal({
      categories: allCategories,
      commonRecordNames,
      settings,
      preselectedCategoryId: category.id,
      onSaved: (record) => {
        categoryRecords = [...categoryRecords, record];
        renderList();
        onChanged();
      },
    });
  });

  renderList();
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
