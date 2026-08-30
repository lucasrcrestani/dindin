import RecordType from '../models/RecordType.js';
import { BaseComponent } from './baseComponent.js';

class DindinOfxDuplicatesModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  render() {
    const { newRows = [], duplicateRows = [], onConfirm } = this.data;

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="modal-ofx-dup-title">
        <div class="modal__header">
          <h2 id="modal-ofx-dup-title" class="modal__title">Transações já importadas</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">
          <p class="csv-import__hint">
            ${duplicateRows.length} transaç${duplicateRows.length === 1 ? 'ão já foi importada' : 'ões já foram importadas'} anteriormente (identificadas pelo FITID).
            Marque as que deseja importar novamente.
          </p>
          <div class="csv-import__table-wrap">
            <table class="csv-import__table">
              <thead>
                <tr>
                  <th><input type="checkbox" id="ofx-dup-select-all" checked title="Selecionar todas" /></th>
                  <th>Tipo</th>
                  <th>Nome</th>
                  <th>Data</th>
                  <th>Valor (R$)</th>
                </tr>
              </thead>
              <tbody id="ofx-dup-tbody"></tbody>
            </table>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn--secondary" id="btn-ofx-dup-skip">Ignorar todas e continuar</button>
            <button type="button" class="btn btn--primary" id="btn-ofx-dup-confirm">Importar selecionadas</button>
          </div>
        </div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    this.addEventListener('click', (event) => {
      if (event.composedPath()[0] === this) this.close();
    });

    const tbody = wrapper.querySelector('#ofx-dup-tbody');
    duplicateRows.forEach((row, index) => {
      const tr = document.createElement('tr');
      const typeLabel = row.recordType === RecordType.INCOME ? 'Receita' : 'Despesa';
      const formattedValue = Number(row.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      tr.innerHTML = `
        <td><input type="checkbox" class="ofx-dup-check" data-index="${index}" checked /></td>
        <td>${typeLabel}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.date}</td>
        <td>${formattedValue}</td>
      `;
      tbody.appendChild(tr);
    });

    const selectAllCheckbox = wrapper.querySelector('#ofx-dup-select-all');
    selectAllCheckbox.addEventListener('change', () => {
      wrapper.querySelectorAll('.ofx-dup-check').forEach((cb) => { cb.checked = selectAllCheckbox.checked; });
    });
    wrapper.querySelectorAll('.ofx-dup-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const all = wrapper.querySelectorAll('.ofx-dup-check');
        selectAllCheckbox.checked = [...all].every((c) => c.checked);
        selectAllCheckbox.indeterminate = !selectAllCheckbox.checked && [...all].some((c) => c.checked);
      });
    });

    const getSelectedDuplicates = () =>
      [...wrapper.querySelectorAll('.ofx-dup-check')]
        .filter((cb) => cb.checked)
        .map((cb) => duplicateRows[Number(cb.dataset.index)]);

    wrapper.querySelector('#btn-ofx-dup-skip').addEventListener('click', () => {
      this.close();
      onConfirm?.([...newRows]);
    });

    wrapper.querySelector('#btn-ofx-dup-confirm').addEventListener('click', () => {
      const selected = getSelectedDuplicates();
      this.close();
      onConfirm?.([...newRows, ...selected]);
    });

    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-ofx-duplicates-modal')) {
  customElements.define('dindin-ofx-duplicates-modal', DindinOfxDuplicatesModal);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openOfxDuplicatesModal({ newRows, duplicateRows, onConfirm }) {
  const modal = document.createElement('dindin-ofx-duplicates-modal');
  modal.data = { newRows, duplicateRows, onConfirm };
  document.getElementById('modals').appendChild(modal);
}

export { openOfxDuplicatesModal };
