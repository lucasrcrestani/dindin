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

function validateRowData({ recordType, name, date, rawValue, isInstallment, installmentCount, tags }) {
  const errors = {};
  if (!recordType) errors.recordType = 'Selecione um tipo válido.';
  if (!name || !name.trim()) errors.name = 'Informe o nome.';
  if (!date) errors.date = 'Informe a data.';
  const parsed = parseFormula(rawValue);
  if (parsed === null || isNaN(parsed)) errors.value = 'Fórmula inválida.';
  if (isInstallment && (!installmentCount || installmentCount < 2)) {
    errors.installmentCount = 'Informe um número de parcelas válido (mínimo 2).';
  }
  if (!tags || tags.length === 0) errors.tags = 'Adicione ao menos uma tag.';
  return errors;
}

function _positionDropdown(list, anchor) {
  const rect = anchor.getBoundingClientRect();
  list.style.top = rect.bottom + 'px';
  list.style.left = rect.left + 'px';
  list.style.width = rect.width + 'px';
}

class DindinBulkAddPage extends BaseComponent {
  render() {
    const { categories = [], commonRecordNames = [], settings = {}, onBack, initialRows = [] } = this.data;
    let _settings = { ...settings };
    let allRecordTags = [];
    getAllRecordTags().then((tags) => { allRecordTags = tags; });

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="bulk-add-page">
        <div class="page-header">
          <button class="btn btn--secondary" id="btn-bulk-back">&#8592; Voltar</button>
          <h2 class="page-title">Lan&#231;amentos em Massa</h2>
          <div></div>
        </div>
        <div class="bulk-table-wrap">
          <table class="bulk-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tipo</th>
                <th>Nome / Local</th>
                <th>Data</th>
                <th>Valor (R$)</th>
                <th>Tags</th>
                <th>Recorrente</th>
                <th>Parcelado</th>
                <th>Parcelas</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="bulk-rows"></tbody>
          </table>
        </div>
        <div class="bulk-add-footer">
          <button class="btn btn--secondary" id="btn-bulk-add-row">+ Adicionar Registro</button>
          <button class="btn btn--primary" id="btn-bulk-save">Salvar Todos</button>
        </div>
      </div>
    `;

    wrapper.querySelector('#btn-bulk-back').addEventListener('click', () => onBack?.());
    const rowsContainer = wrapper.querySelector('#bulk-rows');

    const updateRowNumbers = () => {
      rowsContainer.querySelectorAll('.bulk-row__number').forEach((element, index) => {
        element.textContent = index + 1;
      });
    };

    const createRow = (initialData = {}) => {
      const row = document.createElement('tr');
      row.className = 'bulk-row';
      row.innerHTML = `
        <td class="bulk-row__number"></td>
        <td class="bulk-col--type">
          <select class="bulk-type">
            <option value="">Selecione</option>
            <option value="${RecordType.EXPENSE}">Despesa</option>
            <option value="${RecordType.INCOME}">Receita</option>
          </select>
          <span class="form-error bulk-type-error" style="display:none">Selecione um tipo v&#225;lido.</span>
        </td>
        <td class="bulk-col--name">
          <div class="autocomplete-wrap">
            <input type="text" class="bulk-name" placeholder="Ex.: Supermercado Extra" />
            <ul class="autocomplete-list bulk-name-list"></ul>
            <span class="form-error bulk-name-error" style="display:none">Informe o nome.</span>
          </div>
        </td>
        <td class="bulk-col--date">
          <input type="date" class="bulk-date" />
          <span class="form-hint--warning bulk-date-future-warning" style="display:none">
            &#9888;&#65039; <span class="bulk-date-future-month-label"></span>
          </span>
          <div class="bulk-current-month-suggestion" style="display:none">
            <label class="checkbox-label checkbox-label--sm">
              <input type="checkbox" class="bulk-current-month" />
              M&#234;s atual (<span class="bulk-current-month-label"></span>)
            </label>
          </div>
          <span class="form-error bulk-date-error" style="display:none">Informe a data.</span>
        </td>
        <td class="bulk-col--value">
          <input type="text" inputmode="decimal" class="bulk-value" placeholder="0,00 ou 10+5" />
          <span class="form-error bulk-value-error" style="display:none">F&#243;rmula inv&#225;lida.</span>
        </td>
        <td class="bulk-col--tags">
          <div class="autocomplete-wrap">
            <div class="tag-input bulk-tags-container">
              <input type="text" class="tag-input__field bulk-tags-input" placeholder="Adicionar tag..." autocomplete="off" />
            </div>
            <ul class="autocomplete-list bulk-tags-list" style="display:none"></ul>
          </div>
          <span class="form-error bulk-tags-error" style="display:none">Adicione ao menos uma tag.</span>
        </td>
        <td class="bulk-col--recurring">
          <input type="checkbox" class="bulk-recurring" />
        </td>
        <td class="bulk-col--installment">
          <input type="checkbox" class="bulk-installment" />
        </td>
        <td class="bulk-col--count">
          <div class="bulk-count-group" style="display:none">
            <input type="number" class="bulk-count" min="2" max="360" placeholder="12" />
            <span class="form-error bulk-count-error" style="display:none">M&#237;nimo 2.</span>
          </div>
        </td>
        <td class="bulk-col--remove">
          <button type="button" class="btn btn--danger btn--sm bulk-row__remove">Remover</button>
        </td>
      `;

      if (initialData.recordType) row.querySelector('.bulk-type').value = initialData.recordType;
      if (initialData.name) row.querySelector('.bulk-name').value = initialData.name;
      if (initialData.value) row.querySelector('.bulk-value').value = initialData.value;

      const typeInput = row.querySelector('.bulk-type');
      const tagsContainer = row.querySelector('.bulk-tags-container');
      const tagsInput = row.querySelector('.bulk-tags-input');
      const tagsList = row.querySelector('.bulk-tags-list');

      const addRowTag = (value) => {
        const tag = String(value ?? '').trim();
        if (!tag) return;
        const existing = tagsContainer.querySelectorAll('[data-tag]');
        for (const element of existing) {
          if (element.dataset.tag === tag) return;
        }
        const badge = document.createElement('span');
        badge.className = 'tag-badge tag-badge--removable';
        badge.dataset.tag = tag;
        badge.innerHTML = `${escapeHtml(tag)}<button type="button" class="tag-badge__remove" aria-label="Remover tag">&times;</button>`;
        badge.querySelector('.tag-badge__remove').addEventListener('click', () => badge.remove());
        tagsContainer.insertBefore(badge, tagsInput);
        tagsInput.value = '';
        tagsList.style.display = 'none';
        tagsList.innerHTML = '';
      };

      const nameInput = row.querySelector('.bulk-name');
      const nameList = row.querySelector('.bulk-name-list');
      nameInput.addEventListener('input', () => {
        const q = nameInput.value.toLowerCase().trim();
        nameList.innerHTML = '';
        if (!q) return;
        const matches = commonRecordNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 6);
        matches.forEach((name) => {
          const li = document.createElement('li');
          li.className = 'autocomplete-item';
          li.textContent = name;
          li.addEventListener('mousedown', (event) => {
            event.preventDefault();
            nameInput.value = name;
            nameList.innerHTML = '';
          });
          nameList.appendChild(li);
        });
        _positionDropdown(nameList, nameInput);
      });
      nameInput.addEventListener('blur', () => {
        setTimeout(() => { nameList.innerHTML = ''; }, 150);
      });

      const renderRowTagSuggestions = () => {
        const q = tagsInput.value.trim().toLowerCase();
        tagsList.innerHTML = '';
        if (!q) {
          tagsList.style.display = 'none';
          return;
        }
        const existingSet = new Set([...tagsContainer.querySelectorAll('[data-tag]')].map((element) => element.dataset.tag));
        const matches = allRecordTags.filter((tag) => tag.toLowerCase().includes(q) && !existingSet.has(tag)).slice(0, 8);
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
            addRowTag(tag);
            tagsInput.focus();
          });
          tagsList.appendChild(li);
        });
        tagsList.style.display = '';
        _positionDropdown(tagsList, tagsContainer);
      };

      tagsInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === 'Tab' || event.key === ' ') {
          if (tagsInput.value.trim()) {
            event.preventDefault();
            addRowTag(tagsInput.value);
          }
        } else if (event.key === 'Backspace' && tagsInput.value === '') {
          const badges = tagsContainer.querySelectorAll('[data-tag]');
          if (badges.length) badges[badges.length - 1].remove();
        }
      });

      tagsInput.addEventListener('input', () => {
        const val = tagsInput.value;
        if (/[\s,]/.test(val)) {
          const parts = val.split(/[\s,]+/);
          const endsWithDelimiter = /[\s,]$/.test(val);
          const completedParts = endsWithDelimiter ? parts.filter(Boolean) : parts.slice(0, -1).filter(Boolean);
          completedParts.forEach((part) => addRowTag(part));
          tagsInput.value = endsWithDelimiter ? '' : (parts[parts.length - 1] || '').trimStart();
        }
        renderRowTagSuggestions();
      });

      tagsInput.addEventListener('blur', () => {
        if (tagsInput.value.trim()) addRowTag(tagsInput.value);
        setTimeout(() => { tagsList.style.display = 'none'; tagsList.innerHTML = ''; }, 150);
      });
      tagsContainer.addEventListener('click', () => tagsInput.focus());

      const tableWrap = wrapper.querySelector('.bulk-table-wrap');
      const onReposition = () => {
        if (nameList.children.length > 0) _positionDropdown(nameList, nameInput);
        if (tagsList.style.display !== 'none' && tagsList.children.length > 0) _positionDropdown(tagsList, tagsContainer);
      };
      tableWrap.addEventListener('scroll', onReposition);
      window.addEventListener('scroll', onReposition, { passive: true });
      window.addEventListener('resize', onReposition, { passive: true });

      row.querySelector('.bulk-row__remove').addEventListener('click', () => {
        tableWrap.removeEventListener('scroll', onReposition);
        window.removeEventListener('scroll', onReposition);
        window.removeEventListener('resize', onReposition);
        row.remove();
        updateRowNumbers();
      });

      const dateInput = row.querySelector('.bulk-date');
      const futureWarning = row.querySelector('.bulk-date-future-warning');
      const futureMonthLabel = row.querySelector('.bulk-date-future-month-label');
      const currentMonthSuggestion = row.querySelector('.bulk-current-month-suggestion');
      const currentMonthLabel = row.querySelector('.bulk-current-month-label');
      const currentMonthCheckbox = row.querySelector('.bulk-current-month');
      dateInput.value = initialData.date ?? new Date().toISOString().slice(0, 10);

      const updateDateHints = () => {
        const dateStr = dateInput.value;
        const isFutureMonth = dateStr && _settings?.currentMonth && dateStr.slice(0, 7) > _settings.currentMonth;
        futureWarning.style.display = isFutureMonth ? '' : 'none';
        dateInput.classList.toggle('input--warning', !!isFutureMonth);
        if (isFutureMonth) futureMonthLabel.textContent = formatMonthLabel(dateStr.slice(0, 7));
        const showSuggestion = _shouldSuggestCurrentMonth(dateStr, _settings);
        currentMonthSuggestion.style.display = showSuggestion ? '' : 'none';
        if (showSuggestion) {
          currentMonthLabel.textContent = formatMonthLabel(_settings.currentMonth);
        } else {
          currentMonthCheckbox.checked = false;
        }
      };

      dateInput.addEventListener('input', updateDateHints);
      updateDateHints();

      const recurringCheckbox = row.querySelector('.bulk-recurring');
      const installmentCheckbox = row.querySelector('.bulk-installment');
      const countGroup = row.querySelector('.bulk-count-group');
      recurringCheckbox.addEventListener('change', () => {
        if (recurringCheckbox.checked) {
          installmentCheckbox.checked = false;
          countGroup.style.display = 'none';
        }
      });
      installmentCheckbox.addEventListener('change', () => {
        if (installmentCheckbox.checked) {
          recurringCheckbox.checked = false;
          countGroup.style.display = '';
        } else {
          countGroup.style.display = 'none';
        }
      });

      return row;
    };

    const appendRow = (initialData = {}) => {
      const row = createRow(initialData);
      rowsContainer.appendChild(row);
      updateRowNumbers();
    };

    const collectRowData = (row) => {
      const tagsInput = row.querySelector('.bulk-tags-input');
      const pendingTag = tagsInput.value.trim();
      if (pendingTag) {
        tagsInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }

      return {
        recordType: row.querySelector('.bulk-type').value,
        name: row.querySelector('.bulk-name').value.trim(),
        date: row.querySelector('.bulk-date').value,
        rawValue: row.querySelector('.bulk-value').value.trim(),
        isRecurring: row.querySelector('.bulk-recurring').checked,
        isInstallment: row.querySelector('.bulk-installment').checked,
        installmentCount: parseInt(row.querySelector('.bulk-count').value, 10),
        useCurrentMonth: row.querySelector('.bulk-current-month').checked,
        tags: [...row.querySelectorAll('.bulk-tags-container [data-tag]')].map((element) => element.dataset.tag),
      };
    };

    const applyRowErrors = (row, errors) => {
      row.querySelector('.bulk-type-error').style.display = errors.recordType ? '' : 'none';
      row.querySelector('.bulk-name-error').style.display = errors.name ? '' : 'none';
      row.querySelector('.bulk-date-error').style.display = errors.date ? '' : 'none';
      row.querySelector('.bulk-value-error').style.display = errors.value ? '' : 'none';
      row.querySelector('.bulk-count-error').style.display = errors.installmentCount ? '' : 'none';
      row.querySelector('.bulk-tags-error').style.display = errors.tags ? '' : 'none';
      row.classList.toggle('bulk-row--error', Object.keys(errors).length > 0);
    };

    const handleSave = async () => {
      const rows = Array.from(rowsContainer.querySelectorAll('.bulk-row'));
      if (rows.length === 0) {
        onBack?.();
        return;
      }

      let allValid = true;
      for (const row of rows) {
        const data = collectRowData(row);
        const errors = validateRowData(data);
        applyRowErrors(row, errors);
        if (Object.keys(errors).length > 0) allValid = false;
      }
      if (!allValid) return;

      console.group(`[Bulk Add] Saving ${rows.length} record(s)`);
      for (const row of rows) {
        const data = collectRowData(row);
        console.log(`  ${data.name} | ${data.rawValue} | ${data.date} | type: ${data.recordType} | tags: ${data.tags.join(', ')} | recurring: ${data.isRecurring} | installment: ${data.isInstallment}${data.isInstallment ? ` (${data.installmentCount}x)` : ''}`);
        const month = data.useCurrentMonth ? _settings.currentMonth : data.date.slice(0, 7);
        if (!_settings.currentMonth) {
          _settings = await saveSettings({ ..._settings, currentMonth: month });
        }

        if (data.isInstallment) {
          await saveInstallmentGroup(
            {
              recordType: data.recordType,
              value: data.rawValue,
              name: data.name,
              date: data.date,
              tags: data.tags,
              registeredInCurrentMonth: data.useCurrentMonth,
              currentMonthOverride: _settings.currentMonth,
            },
            data.installmentCount
          );
        } else {
          await saveRecord({
            recordType: data.recordType,
            value: data.rawValue,
            name: data.name,
            date: data.date,
            month: data.useCurrentMonth ? _settings.currentMonth : undefined,
            isRecurring: data.isRecurring,
            registeredInCurrentMonth: data.useCurrentMonth,
            tags: data.tags,
          });
        }

        await addCommonRecordName(data.name);
      }
      console.groupEnd();
      console.log(`[BulkAdd] ${rows.length} registros adicionados com sucesso`);
      onBack?.();
    };

    wrapper.querySelector('#btn-bulk-add-row').addEventListener('click', appendRow);
    wrapper.querySelector('#btn-bulk-save').addEventListener('click', async () => {
      await handleSave();
    });

    if (initialRows.length > 0) {
      initialRows.forEach((row) => appendRow(row));
    } else {
      appendRow();
    }
    void categories;
    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-bulk-add-page')) {
  customElements.define('dindin-bulk-add-page', DindinBulkAddPage);
}

function renderBulkAddPage(container, { categories, commonRecordNames, settings, onBack, initialRows = [] }) {
  const page = document.createElement('dindin-bulk-add-page');
  page.data = { categories, commonRecordNames, settings, onBack, initialRows };
  container.innerHTML = '';
  container.appendChild(page);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { renderBulkAddPage, validateRowData };