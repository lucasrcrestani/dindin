import { saveRecord, saveInstallmentGroup } from '../services/recordService.js';
import { addCommonRecordName } from '../services/commonRecordNameService.js';
import { saveSettings } from '../services/settingsService.js';
import RecordType from '../models/RecordType.js';
import { parseFormula } from '../utils/formulaUtils.js';

/**
 * Open the add record modal.
 * @param {{
 *   categories: object[],
 *   commonRecordNames: string[],
 *   settings: object,
 *   onSaved: (record: object) => void
 * }} options
 */
function openAddRecordModal({ categories, commonRecordNames, settings, preselectedCategoryId, initial, onSaved }) {
  const isEditing = !!initial;

  const expenseCategories = categories.filter((c) => c.recordType === RecordType.EXPENSE);
  const incomeCategories = categories.filter((c) => c.recordType === RecordType.INCOME);

  const buildOptions = (cats) =>
    cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  const allOptions = `
    <optgroup label="Despesas">${buildOptions(expenseCategories)}</optgroup>
    <optgroup label="Receitas">${buildOptions(incomeCategories)}</optgroup>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-rec-title">
      <div class="modal__header">
        <h2 id="modal-rec-title" class="modal__title">${isEditing ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
        <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal__body">
        <form id="form-record" novalidate autocomplete="off">
          <div class="form-group">
            <label for="rec-category">Categoria</label>
            <select id="rec-category" required>${allOptions}</select>
          </div>
          <div class="form-group autocomplete-wrap">
            <label for="rec-name">Nome / Local</label>
            <input id="rec-name" type="text" placeholder="Ex.: Supermercado Extra" required />
            <ul class="autocomplete-list" id="autocomplete-list"></ul>
          </div>
          <div class="form-group">
            <label for="rec-date">Data</label>
            <input id="rec-date" type="date" required />
          </div>
          <div id="rec-recurring-group" class="form-group form-group--checkbox">
            <label class="checkbox-label">
              <input id="rec-recurring" type="checkbox" />
              Recorrente (repete todo mês)
            </label>
          </div>
          <div id="rec-installment-group" class="form-group form-group--checkbox">
            <label class="checkbox-label">
              <input id="rec-installment" type="checkbox" />
              Parcelado
            </label>
          </div>
          <div id="rec-installment-count-group" class="form-group" style="display:none">
            <label for="rec-installment-count">Número de parcelas</label>
            <input id="rec-installment-count" type="number" min="2" max="360" placeholder="Ex.: 12" />
            <span id="rec-installment-count-error" class="form-error" style="display:none">Informe um número de parcelas válido (mínimo 2).</span>
          </div>
          <div class="form-group">
            <label for="rec-value">Valor (R$)</label>
            <input id="rec-value" type="text" inputmode="decimal" placeholder="0,00 ou 10 + 5" required />
            <span id="rec-value-error" class="form-error" style="display:none">Fórmula inválida.</span>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn--secondary" id="btn-rec-cancel">Cancelar</button>
            <button type="submit" class="btn btn--primary">Salvar</button>
          </div>
        </form>
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
  overlay.querySelector('#btn-rec-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Default date to today (or pre-fill from initial record)
  overlay.querySelector('#rec-date').value = initial?.date ?? new Date().toISOString().slice(0, 10);

  // Pre-select category
  const categorySelect = overlay.querySelector('#rec-category');
  if (initial?.categoryId) {
    categorySelect.value = initial.categoryId;
  } else if (preselectedCategoryId) {
    categorySelect.value = preselectedCategoryId;
  }

  // Pre-fill name and value when editing
  if (initial) {
    overlay.querySelector('#rec-name').value = initial.name ?? '';
    overlay.querySelector('#rec-value').value = initial.value ?? '';
    overlay.querySelector('#rec-recurring').checked = initial.isRecurring ?? false;
  }

  // When editing an installment record, hide recurring/installment toggles and show info badge
  const isEditingInstallment = isEditing && initial?.isInstallment;
  if (isEditingInstallment) {
    overlay.querySelector('#rec-recurring-group').style.display = 'none';
    overlay.querySelector('#rec-installment-group').style.display = 'none';
    const badge = document.createElement('div');
    badge.className = 'form-group installment-badge';
    badge.innerHTML = `<span class="badge badge--installment">Parcela ${initial.installmentNumber}/${initial.installmentTotal}</span>`;
    overlay.querySelector('#rec-installment-group').insertAdjacentElement('afterend', badge);
  }

  // ─── Parcelado / Recorrente mutual exclusion ───────────────────────────────
  const recurringCheckbox = overlay.querySelector('#rec-recurring');
  const installmentCheckbox = overlay.querySelector('#rec-installment');
  const installmentCountGroup = overlay.querySelector('#rec-installment-count-group');

  recurringCheckbox.addEventListener('change', () => {
    if (recurringCheckbox.checked) {
      installmentCheckbox.checked = false;
      installmentCountGroup.style.display = 'none';
    }
  });

  installmentCheckbox.addEventListener('change', () => {
    if (installmentCheckbox.checked) {
      recurringCheckbox.checked = false;
      installmentCountGroup.style.display = '';
    } else {
      installmentCountGroup.style.display = 'none';
    }
  });

  // ─── Autocomplete ──────────────────────────────────────────────────────────
  const nameInput = overlay.querySelector('#rec-name');
  const acList = overlay.querySelector('#autocomplete-list');

  nameInput.addEventListener('input', () => {
    const q = nameInput.value.toLowerCase().trim();
    acList.innerHTML = '';
    if (!q) return;
    const matches = commonRecordNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
    matches.forEach((name) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.textContent = name;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        nameInput.value = name;
        acList.innerHTML = '';
      });
      acList.appendChild(li);
    });
  });

  nameInput.addEventListener('blur', () => {
    setTimeout(() => { acList.innerHTML = ''; }, 150);
  });

  // ─── Submit ────────────────────────────────────────────────────────────────
  overlay.querySelector('#form-record').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const rawValue = overlay.querySelector('#rec-value').value.trim();
    const categoryId = overlay.querySelector('#rec-category').value;
    const date = overlay.querySelector('#rec-date').value;
    const isRecurring = overlay.querySelector('#rec-recurring').checked;
    const isInstallment = overlay.querySelector('#rec-installment').checked;
    const valueError = overlay.querySelector('#rec-value-error');
    const countError = overlay.querySelector('#rec-installment-count-error');

    const parsed = parseFormula(rawValue);
    if (parsed === null || isNaN(parsed)) {
      valueError.style.display = '';
      return;
    }
    valueError.style.display = 'none';

    if (!name || !categoryId || !date) return;

    // Validate installment count
    if (isInstallment && !isEditingInstallment) {
      const countInput = overlay.querySelector('#rec-installment-count');
      const count = parseInt(countInput.value, 10);
      if (!count || count < 2) {
        countError.style.display = '';
        return;
      }
      countError.style.display = 'none';

      const month = date.slice(0, 7);
      let updatedSettings = settings;
      if (!settings.currentMonth) {
        updatedSettings = await saveSettings({ ...settings, currentMonth: month });
      }

      const records = await saveInstallmentGroup({ categoryId, value: rawValue, name, date }, count);
      await addCommonRecordName(name);
      close();
      onSaved(records[0], updatedSettings);
      return;
    }

    const month = date.slice(0, 7); // YYYY-MM derived from date

    // Set currentMonth on first record
    let updatedSettings = settings;
    if (!settings.currentMonth) {
      updatedSettings = await saveSettings({ ...settings, currentMonth: month });
    }

    const record = await saveRecord(
      isEditing
        ? { ...initial, categoryId, value: rawValue, name, date, month, isRecurring }
        : { categoryId, value: rawValue, name, date, isRecurring }
    );
    await addCommonRecordName(name);

    close();
    onSaved(record, updatedSettings);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { openAddRecordModal };
