import { parseFormula } from '../utils/formulaUtils.js';
import { formatMonthLabel } from '../utils/dateUtils.js';

/**
 * Open the recurring records confirmation modal shown before closing a month.
 * @param {{
 *   records: object[],
 *   categories: object[],
 *   newMonth: string,
 *   onConfirm: (confirmedRecords: object[]) => void,
 *   onCancel: () => void,
 * }} options
 */
function openRecurringConfirmModal({ records, categories, newMonth, onConfirm, onCancel }) {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const newMonthLabel = formatMonthLabel(newMonth);

  // Working copy — each entry holds the record template plus overridable fields
  let items = records.map((r) => ({ ...r }));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--tall" role="dialog" aria-modal="true" aria-labelledby="modal-rc-title">
      <div class="modal__header">
        <h2 id="modal-rc-title" class="modal__title">Registros Recorrentes</h2>
        <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal__body">
        <p class="recurring-confirm__subtitle">
          Os registros abaixo serão criados em <strong>${escapeHtml(newMonthLabel)}</strong>.
          Remova ou ajuste antes de confirmar.
        </p>
        <ul class="recurring-confirm__list" id="rc-list"></ul>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--secondary" id="btn-rc-skip">Pular</button>
        <button type="button" class="btn btn--primary" id="btn-rc-confirm">Confirmar</button>
      </div>
    </div>
  `;

  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const close = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal__close').addEventListener('click', () => { close(); onCancel(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); onCancel(); } });

  function renderList() {
    const list = overlay.querySelector('#rc-list');
    list.innerHTML = '';

    if (items.length === 0) {
      list.innerHTML = '<li class="recurring-confirm__empty">Nenhum registro recorrente.</li>';
      return;
    }

    items.forEach((item, idx) => {
      const category = categoryMap.get(item.categoryId);
      const li = document.createElement('li');
      li.className = 'recurring-confirm__item';
      li.dataset.idx = idx;
      li.innerHTML = `
        <div class="recurring-confirm__meta">
          <span class="recurring-confirm__category">${escapeHtml(category?.name ?? '—')}</span>
        </div>
        <div class="recurring-confirm__fields">
          <input
            type="text"
            class="recurring-confirm__name-input"
            value="${escapeHtml(item.name)}"
            aria-label="Nome do registro"
            data-field="name"
            data-idx="${idx}"
          />
          <input
            type="text"
            class="recurring-confirm__value-input"
            value="${escapeHtml(String(item.value))}"
            aria-label="Valor do registro"
            data-field="value"
            data-idx="${idx}"
            inputmode="decimal"
          />
          <button type="button" class="btn btn--danger btn--sm recurring-confirm__remove" data-idx="${idx}" aria-label="Remover">
            Remover
          </button>
        </div>
        <span class="recurring-confirm__value-error form-error" style="display:none">Fórmula inválida.</span>
      `;
      list.appendChild(li);
    });

    // Field change listeners
    list.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.idx);
        items[i][input.dataset.field] = input.value;
        const errorEl = input.closest('.recurring-confirm__item').querySelector('.recurring-confirm__value-error');
        if (input.dataset.field === 'value') {
          const parsed = parseFormula(input.value.trim());
          errorEl.style.display = (parsed === null || isNaN(parsed)) ? '' : 'none';
        }
      });
    });

    // Remove listeners
    list.querySelectorAll('.recurring-confirm__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.idx);
        items.splice(i, 1);
        renderList();
      });
    });
  }

  renderList();

  overlay.querySelector('#btn-rc-skip').addEventListener('click', () => {
    close();
    onConfirm([]);
  });

  overlay.querySelector('#btn-rc-confirm').addEventListener('click', () => {
    // Validate all value fields
    let hasError = false;
    overlay.querySelectorAll('.recurring-confirm__value-input').forEach((input, idx) => {
      const errorEl = input.closest('.recurring-confirm__item').querySelector('.recurring-confirm__value-error');
      const parsed = parseFormula(input.value.trim());
      if (parsed === null || isNaN(parsed)) {
        errorEl.style.display = '';
        hasError = true;
      }
    });
    if (hasError) return;

    close();
    onConfirm(items.map((item) => ({ ...item })));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { openRecurringConfirmModal };
