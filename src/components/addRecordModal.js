import { saveRecord, saveInstallmentGroup, getAllRecordTags } from '../services/recordService.js';
import { addCommonRecordName } from '../services/commonRecordNameService.js';
import { saveSettings } from '../services/settingsService.js';
import RecordType from '../models/RecordType.js';
import { parseFormula } from '../utils/formulaUtils.js';
import { currentMonthKey, formatMonthLabel } from '../utils/dateUtils.js';
import { BaseComponent } from './baseComponent.js';

function _shouldSuggestCurrentMonth(dateStr, settings) {
  if (!dateStr || !settings?.currentMonth) return false;
  return dateStr.slice(0, 7) > settings.currentMonth && currentMonthKey() === settings.currentMonth;
}

class DindinAddRecordModal extends BaseComponent {
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
      categories = [],
      commonRecordNames = [],
      settings = {},
      preselectedRecordType = '',
      inheritedTags = [],
      lockRecordType = false,
      initial,
      onSaved,
    } = this.data;
    const isEditing = !!initial;

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-rec-title">
        <div class="modal__header">
          <h2 id="modal-rec-title" class="modal__title">${isEditing ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">
          <form id="form-record" novalidate autocomplete="off">
            <div class="form-group">
              <label for="rec-type">Tipo</label>
              <select id="rec-type" ${lockRecordType ? 'disabled' : ''}>
                <option value="">Selecione</option>
                <option value="${RecordType.EXPENSE}">Despesa</option>
                <option value="${RecordType.INCOME}">Receita</option>
              </select>
              <span id="rec-type-error" class="form-error" style="display:none">Selecione um tipo válido.</span>
            </div>
            <div class="form-group autocomplete-wrap">
              <label for="rec-name">Nome / Local</label>
              <input id="rec-name" type="text" placeholder="Ex.: Supermercado Extra" required />
              <ul class="autocomplete-list" id="autocomplete-list"></ul>
            </div>
            <div class="form-group">
              <label for="rec-date">Data</label>
              <input id="rec-date" type="date" required />
              <span id="rec-date-future-warning" class="form-hint--warning" style="display:none">
                ⚠️ Data em mês futuro
                (<span id="rec-date-future-month-label"></span>)
              </span>
            </div>
            <div id="rec-current-month-suggestion" class="form-group form-group--checkbox" style="display:none">
              <label class="checkbox-label">
                <input id="rec-current-month" type="checkbox" />
                Registrar no mês atual (<span id="rec-current-month-label"></span>)
              </label>
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
            <div class="form-group">
              <label>Tags</label>
              <div class="autocomplete-wrap">
                <div class="tag-input" id="rec-tags-container">
                  <input id="rec-tags" type="text" placeholder="Adicionar tag..." class="tag-input__field" autocomplete="off" />
                </div>
                <ul class="autocomplete-list" id="rec-tags-list" style="display:none"></ul>
              </div>
              <span id="rec-tags-error" class="form-error" style="display:none">Adicione ao menos uma tag.</span>
            </div>
            <div class="modal__footer">
              <button type="button" class="btn btn--secondary" id="btn-rec-cancel">Cancelar</button>
              <button type="submit" class="btn btn--primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    wrapper.querySelector('#btn-rec-cancel').addEventListener('click', () => this.close());
    this.addEventListener('click', (event) => {
      if (event.composedPath()[0] === this) this.close();
    });

    wrapper.querySelector('#rec-date').value = initial?.date ?? new Date().toISOString().slice(0, 10);

    const typeInput = wrapper.querySelector('#rec-type');
    const typeError = wrapper.querySelector('#rec-type-error');
    const tagsContainer = wrapper.querySelector('#rec-tags-container');
    const tagTextField = wrapper.querySelector('#rec-tags');
    const tagsList = wrapper.querySelector('#rec-tags-list');
    const lockedTagSet = new Set((inheritedTags ?? []).map((tag) => String(tag).trim()).filter(Boolean));

    let allRecordTags = [];
    getAllRecordTags().then((tags) => { allRecordTags = tags; });

    const addTag = (value, { locked = false } = {}) => {
      const tag = String(value ?? '').trim();
      if (!tag) return;

      const existing = [...tagsContainer.querySelectorAll('[data-tag]')].find((element) => element.dataset.tag === tag);
      if (existing) {
        if (locked) {
          existing.dataset.locked = 'true';
          existing.classList.add('tag-badge--locked');
          const removeButton = existing.querySelector('.tag-badge__remove');
          if (removeButton) removeButton.remove();
        }
        tagTextField.value = '';
        return;
      }

      const badge = document.createElement('span');
      badge.className = 'tag-badge tag-badge--removable';
      if (locked) badge.classList.add('tag-badge--locked');
      badge.dataset.tag = tag;
      badge.dataset.locked = locked ? 'true' : 'false';
      badge.innerHTML = escapeHtml(tag);

      if (!locked) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tag-badge__remove';
        removeButton.setAttribute('aria-label', 'Remover tag');
        removeButton.innerHTML = '&times;';
        removeButton.addEventListener('click', () => badge.remove());
        badge.appendChild(removeButton);
      }

      tagsContainer.insertBefore(badge, tagTextField);
      tagTextField.value = '';
      tagsList.style.display = 'none';
      tagsList.innerHTML = '';
    };

    const renderTagSuggestions = () => {
      const q = tagTextField.value.trim().toLowerCase();
      tagsList.innerHTML = '';
      if (!q) {
        tagsList.style.display = 'none';
        return;
      }
      const existing = new Set([...tagsContainer.querySelectorAll('[data-tag]')].map((element) => element.dataset.tag));
      const matches = allRecordTags.filter((tag) => tag.toLowerCase().includes(q) && !existing.has(tag)).slice(0, 8);
      if (matches.length === 0) {
        tagsList.style.display = 'none';
        return;
      }
      matches.forEach((tag) => {
        const li = document.createElement('li');
        li.className = 'autocomplete-item';
        li.textContent = tag;
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          addTag(tag);
          tagTextField.focus();
        });
        tagsList.appendChild(li);
      });
      tagsList.style.display = '';
    };

    tagTextField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Tab' || event.key === ' ') {
        if (tagTextField.value.trim()) {
          event.preventDefault();
          addTag(tagTextField.value);
        }
      } else if (event.key === 'Backspace' && tagTextField.value === '') {
        const badges = [...tagsContainer.querySelectorAll('[data-tag]')].filter((badge) => badge.dataset.locked !== 'true');
        if (badges.length) badges[badges.length - 1].remove();
      }
    });

    tagTextField.addEventListener('input', () => {
      const value = tagTextField.value;
      if (/[\s,]/.test(value)) {
        const parts = value.split(/[\s,]+/);
        const endsWithDelimiter = /[\s,]$/.test(value);
        const completedParts = endsWithDelimiter ? parts.filter(Boolean) : parts.slice(0, -1).filter(Boolean);
        completedParts.forEach((part) => addTag(part));
        tagTextField.value = endsWithDelimiter ? '' : (parts[parts.length - 1] || '').trimStart();
      }
      renderTagSuggestions();
    });
    tagTextField.addEventListener('blur', () => {
      if (tagTextField.value.trim()) addTag(tagTextField.value);
      setTimeout(() => {
        tagsList.style.display = 'none';
        tagsList.innerHTML = '';
      }, 150);
    });
    tagsContainer.addEventListener('click', () => tagTextField.focus());

    typeInput.value = initial?.recordType ?? preselectedRecordType ?? '';
    if (initial) {
      wrapper.querySelector('#rec-name').value = initial.name ?? '';
      wrapper.querySelector('#rec-value').value = initial.value ?? '';
      wrapper.querySelector('#rec-recurring').checked = initial.isRecurring ?? false;
    }

    const initialLockedTags = initial?.lockedTags ?? [...lockedTagSet];
    initialLockedTags.forEach((tag) => addTag(tag, { locked: true }));
    (initial?.tags ?? []).forEach((tag) => addTag(tag, { locked: lockedTagSet.has(tag) }));
    if (!initial && inheritedTags?.length) {
      inheritedTags.forEach((tag) => addTag(tag, { locked: true }));
    }

    const isEditingInstallment = isEditing && initial?.isInstallment;
    if (isEditingInstallment) {
      wrapper.querySelector('#rec-recurring-group').style.display = 'none';
      wrapper.querySelector('#rec-installment-group').style.display = 'none';
      const badge = document.createElement('div');
      badge.className = 'form-group installment-badge';
      badge.innerHTML = `<span class="badge badge--installment">Parcela ${initial.installmentNumber}/${initial.installmentTotal}</span>`;
      wrapper.querySelector('#rec-installment-group').insertAdjacentElement('afterend', badge);
    }

    const recurringCheckbox = wrapper.querySelector('#rec-recurring');
    const installmentCheckbox = wrapper.querySelector('#rec-installment');
    const installmentCountGroup = wrapper.querySelector('#rec-installment-count-group');

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

    const dateInput = wrapper.querySelector('#rec-date');
    const currentMonthSuggestion = wrapper.querySelector('#rec-current-month-suggestion');
    const currentMonthLabel = wrapper.querySelector('#rec-current-month-label');
    const futureWarning = wrapper.querySelector('#rec-date-future-warning');
    const futureMonthLabel = wrapper.querySelector('#rec-date-future-month-label');

    const updateDateHints = () => {
      const dateStr = dateInput.value;
      const isFutureMonth = dateStr && settings?.currentMonth && dateStr.slice(0, 7) > settings.currentMonth;
      futureWarning.style.display = isFutureMonth ? '' : 'none';
      dateInput.classList.toggle('input--warning', !!isFutureMonth);
      if (isFutureMonth) {
        futureMonthLabel.textContent = formatMonthLabel(dateStr.slice(0, 7));
      }

      const showSuggestion = _shouldSuggestCurrentMonth(dateStr, settings);
      currentMonthSuggestion.style.display = showSuggestion ? '' : 'none';
      if (showSuggestion) {
        currentMonthLabel.textContent = formatMonthLabel(settings.currentMonth);
      } else {
        wrapper.querySelector('#rec-current-month').checked = false;
      }
    };

    dateInput.addEventListener('input', updateDateHints);
    updateDateHints();

    const nameInput = wrapper.querySelector('#rec-name');
    const acList = wrapper.querySelector('#autocomplete-list');
    nameInput.addEventListener('input', () => {
      const q = nameInput.value.toLowerCase().trim();
      acList.innerHTML = '';
      if (!q) return;
      const matches = commonRecordNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 6);
      matches.forEach((name) => {
        const li = document.createElement('li');
        li.className = 'autocomplete-item';
        li.textContent = name;
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          nameInput.value = name;
          acList.innerHTML = '';
        });
        acList.appendChild(li);
      });
    });
    nameInput.addEventListener('blur', () => {
      setTimeout(() => { acList.innerHTML = ''; }, 150);
    });

    wrapper.querySelector('#form-record').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const rawValue = wrapper.querySelector('#rec-value').value.trim();
      const date = wrapper.querySelector('#rec-date').value;
      const recordType = typeInput.value;
      const isRecurring = wrapper.querySelector('#rec-recurring').checked;
      const isInstallment = wrapper.querySelector('#rec-installment').checked;
      const valueError = wrapper.querySelector('#rec-value-error');
      const countError = wrapper.querySelector('#rec-installment-count-error');

      if (tagTextField.value.trim()) addTag(tagTextField.value);
      const tags = [...tagsContainer.querySelectorAll('[data-tag]')].map((element) => element.dataset.tag);
      const tagsError = wrapper.querySelector('#rec-tags-error');

      const parsed = parseFormula(rawValue);
      if (parsed === null || isNaN(parsed)) {
        valueError.style.display = '';
        return;
      }
      valueError.style.display = 'none';

      if (!recordType) {
        typeError.style.display = '';
        typeInput.focus();
        return;
      }
      typeError.style.display = 'none';

      if (tags.length === 0) {
        tagsError.style.display = '';
        tagTextField.focus();
        return;
      }
      tagsError.style.display = 'none';

      if (!name || !date) return;

      const useCurrentMonth = wrapper.querySelector('#rec-current-month').checked;

      if (isInstallment && !isEditingInstallment) {
        const countInput = wrapper.querySelector('#rec-installment-count');
        const count = parseInt(countInput.value, 10);
        if (!count || count < 2) {
          countError.style.display = '';
          return;
        }
        countError.style.display = 'none';

        const month = useCurrentMonth ? settings.currentMonth : date.slice(0, 7);
        let updatedSettings = settings;
        if (!settings.currentMonth) {
          updatedSettings = await saveSettings({ ...settings, currentMonth: month });
        }

        console.group('[Add Record] Saving installment group');
        console.log('Name:', name);
        console.log('Type:', recordType);
        console.log('Date:', date);
        console.log('Value (raw):', rawValue, `(parsed: ${parsed})`);
        console.log('Installment count:', count);
        console.log('Register in current month:', useCurrentMonth);
        console.log('Tags:', tags);
        console.groupEnd();

        const records = await saveInstallmentGroup(
          { recordType, value: rawValue, name, date, tags, registeredInCurrentMonth: useCurrentMonth, currentMonthOverride: settings.currentMonth },
          count
        );
        console.log('[Add Record] Installment group saved:', records.length, 'installment(s), groupId:', records[0]?.installmentGroupId);
        await addCommonRecordName(name);
        this.close();
        onSaved?.(records[0], updatedSettings);
        return;
      }

      const month = useCurrentMonth ? settings.currentMonth : date.slice(0, 7);
      let updatedSettings = settings;
      if (!settings.currentMonth) {
        updatedSettings = await saveSettings({ ...settings, currentMonth: month });
      }

      console.group(isEditing ? '[Add Record] Updating record' : '[Add Record] Creating record');
      console.log('Name:', name);
      console.log('Type:', recordType);
      console.log('Date:', date);
      console.log('Value (raw):', rawValue, `(parsed: ${parsed})`);
      console.log('Recurring:', isRecurring);
      console.log('Register in current month:', useCurrentMonth);
      console.log('Tags:', tags);
      if (isEditing) console.log('Record ID:', initial.id);
      console.groupEnd();

      const record = await saveRecord(
        isEditing
          ? { ...initial, recordType, value: rawValue, name, date, month, isRecurring, registeredInCurrentMonth: useCurrentMonth, tags }
          : { recordType, value: rawValue, name, date, month: useCurrentMonth ? settings.currentMonth : undefined, isRecurring, registeredInCurrentMonth: useCurrentMonth, tags }
      );
      console.log('[Add Record] Record saved:', record.id);
      await addCommonRecordName(name);

      this.close();
      onSaved?.(record, updatedSettings);
    });

    void categories;
    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-add-record-modal')) {
  customElements.define('dindin-add-record-modal', DindinAddRecordModal);
}

function openAddRecordModal({ categories, commonRecordNames, settings, preselectedRecordType, inheritedTags, lockRecordType, initial, onSaved }) {
  const modal = document.createElement('dindin-add-record-modal');
  modal.data = { categories, commonRecordNames, settings, preselectedRecordType, inheritedTags, lockRecordType, initial, onSaved };
  document.getElementById('modals').appendChild(modal);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { openAddRecordModal };
