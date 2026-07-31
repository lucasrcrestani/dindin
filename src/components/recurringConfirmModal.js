import { parseFormula } from '../utils/formulaUtils.js';
import { formatMonthLabel } from '../utils/dateUtils.js';
import { BaseComponent } from './baseComponent.js';

class DindinRecurringConfirmModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  render() {
    const { records = [], categories = [], newMonth, onConfirm, onCancel } = this.data;
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const newMonthLabel = formatMonthLabel(newMonth);
    if (!this._items) {
      this._items = records.map((record) => ({ ...record }));
    }

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
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

    wrapper.querySelector('.modal__close').addEventListener('click', () => {
      this.close();
      onCancel?.();
    });
    this.onclick = (event) => {
      if (event.target === this) {
        this.close();
        onCancel?.();
      }
    };

    const renderList = () => {
      const list = wrapper.querySelector('#rc-list');
      list.innerHTML = '';

      if (this._items.length === 0) {
        list.innerHTML = '<li class="recurring-confirm__empty">Nenhum registro recorrente.</li>';
        return;
      }

      this._items.forEach((item, index) => {
        const category = categoryMap.get(item.categoryId);
        const li = document.createElement('li');
        li.className = 'recurring-confirm__item';
        li.dataset.idx = index;
        li.innerHTML = `
          <div class="recurring-confirm__meta">
            <span class="recurring-confirm__category">${escapeHtml(category?.name ?? '—')}</span>
          </div>
          <div class="recurring-confirm__fields">
            <input type="text" class="recurring-confirm__name-input" value="${escapeHtml(item.name)}" aria-label="Nome do registro" data-field="name" data-idx="${index}" />
            <input type="text" class="recurring-confirm__value-input" value="${escapeHtml(String(item.value))}" aria-label="Valor do registro" data-field="value" data-idx="${index}" inputmode="decimal" />
            <button type="button" class="btn btn--danger btn--sm recurring-confirm__remove" data-idx="${index}" aria-label="Remover">Remover</button>
          </div>
          <span class="recurring-confirm__value-error form-error" style="display:none">Fórmula inválida.</span>
        `;
        list.appendChild(li);
      });

      list.querySelectorAll('[data-field]').forEach((input) => {
        input.addEventListener('input', () => {
          const i = Number(input.dataset.idx);
          this._items[i][input.dataset.field] = input.value;
          const errorEl = input.closest('.recurring-confirm__item').querySelector('.recurring-confirm__value-error');
          if (input.dataset.field === 'value') {
            const parsed = parseFormula(input.value.trim());
            errorEl.style.display = (parsed === null || isNaN(parsed)) ? '' : 'none';
          }
        });
      });

      list.querySelectorAll('.recurring-confirm__remove').forEach((button) => {
        button.addEventListener('click', () => {
          const i = Number(button.dataset.idx);
          this._items.splice(i, 1);
          renderList();
        });
      });
    };

    wrapper.querySelector('#btn-rc-skip').addEventListener('click', () => {
      this.close();
      onConfirm?.([]);
    });

    wrapper.querySelector('#btn-rc-confirm').addEventListener('click', () => {
      let hasError = false;
      wrapper.querySelectorAll('.recurring-confirm__value-input').forEach((input) => {
        const errorEl = input.closest('.recurring-confirm__item').querySelector('.recurring-confirm__value-error');
        const parsed = parseFormula(input.value.trim());
        if (parsed === null || isNaN(parsed)) {
          errorEl.style.display = '';
          hasError = true;
        }
      });
      if (hasError) return;

      this.close();
      onConfirm?.(this._items.map((item) => ({ ...item })));
    });

    this.replaceContent(wrapper);
    renderList();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-recurring-confirm-modal')) {
  customElements.define('dindin-recurring-confirm-modal', DindinRecurringConfirmModal);
}

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
  const modal = document.createElement('dindin-recurring-confirm-modal');
  modal.data = { records, categories, newMonth, onConfirm, onCancel };
  document.getElementById('modals').appendChild(modal);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { openRecurringConfirmModal };
