import { saveRecord, saveInstallmentGroup } from '../services/recordService.js';
import { addCommonRecordName } from '../services/commonRecordNameService.js';
import { saveSettings } from '../services/settingsService.js';
import RecordType from '../models/RecordType.js';
import { parseFormula } from '../utils/formulaUtils.js';
import { currentMonthKey, formatMonthLabel } from '../utils/dateUtils.js';

/**
 * Filters and groups categories by a search query.
 * @param {object[]} categories
 * @param {string} query
 * @returns {{ expenses: object[], incomes: object[] }}
 */
function filterCategories(categories, query) {
  const q = query.toLowerCase().trim();
  const filtered = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  return {
    expenses: filtered.filter((c) => c.recordType === RecordType.EXPENSE),
    incomes: filtered.filter((c) => c.recordType === RecordType.INCOME),
  };
}

function _shouldSuggestCurrentMonth(dateStr, settings) {
  if (!dateStr || !settings?.currentMonth) return false;
  return dateStr.slice(0, 7) > settings.currentMonth && currentMonthKey() === settings.currentMonth;
}

/**
 * Validates a row data object. Returns a map of field → error message.
 * An empty object means valid.
 * @param {{ categoryId: string, name: string, date: string, rawValue: string, isInstallment: boolean, installmentCount: number }} data
 * @returns {Record<string, string>}
 */
function validateRowData({ categoryId, name, date, rawValue, isInstallment, installmentCount }) {
  const errors = {};
  if (!categoryId) errors.categoryId = 'Selecione uma categoria válida.';
  if (!name || !name.trim()) errors.name = 'Informe o nome.';
  if (!date) errors.date = 'Informe a data.';
  const parsed = parseFormula(rawValue);
  if (parsed === null || isNaN(parsed)) errors.value = 'Fórmula inválida.';
  if (isInstallment && (!installmentCount || installmentCount < 2)) {
    errors.installmentCount = 'Informe um número de parcelas válido (mínimo 2).';
  }
  return errors;
}

/**
 * Positions a dropdown list (position:fixed) anchored below an input element.
 * @param {HTMLElement} list
 * @param {HTMLElement} anchor
 */
function _positionDropdown(list, anchor) {
  const rect = anchor.getBoundingClientRect();
  list.style.top = rect.bottom + 'px';
  list.style.left = rect.left + 'px';
  list.style.width = rect.width + 'px';
}

/**
 * Render the bulk add page into the given container.
 * @param {HTMLElement} container
 * @param {{
 *   categories: object[],
 *   commonRecordNames: string[],
 *   settings: object,
 *   onBack: () => void
 * }} options
 */
function renderBulkAddPage(container, { categories, commonRecordNames, settings, onBack }) {
  let _settings = { ...settings };

  container.innerHTML = `
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
              <th>Categoria</th>
              <th>Nome / Local</th>
              <th>Data</th>
              <th>Valor (R$)</th>
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

  container.querySelector('#btn-bulk-back').addEventListener('click', onBack);

  const rowsContainer = container.querySelector('#bulk-rows');

  container.querySelector('#btn-bulk-add-row').addEventListener('click', () => {
    _appendRow();
  });

  container.querySelector('#btn-bulk-save').addEventListener('click', async () => {
    await _handleSave();
  });

  _appendRow();

  function _appendRow() {
    const row = _createRow();
    rowsContainer.appendChild(row);
    _updateRowNumbers();
  }

  function _updateRowNumbers() {
    rowsContainer.querySelectorAll('.bulk-row__number').forEach((el, i) => {
      el.textContent = i + 1;
    });
  }

  function _createRow() {
    const row = document.createElement('tr');
    row.className = 'bulk-row';
    row.innerHTML = `
      <td class="bulk-row__number"></td>
      <td class="bulk-col--cat">
        <div class="autocomplete-wrap">
          <input type="text" class="bulk-cat-search" placeholder="Buscar categoria..." autocomplete="off" />
          <input type="hidden" class="bulk-cat-id" />
          <ul class="autocomplete-list bulk-cat-list"></ul>
          <span class="form-error bulk-cat-error" style="display:none">Selecione uma categoria v&#225;lida.</span>
        </div>
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

    // ── Category search ────────────────────────────────────────────────────────
    const catSearch = row.querySelector('.bulk-cat-search');
    const catId = row.querySelector('.bulk-cat-id');
    const catList = row.querySelector('.bulk-cat-list');

    const renderCategoryList = (query) => {
      catList.innerHTML = '';
      const { expenses, incomes } = filterCategories(categories, query);
      if (expenses.length === 0 && incomes.length === 0) return;

      const appendGroup = (label, cats) => {
        if (cats.length === 0) return;
        const groupLi = document.createElement('li');
        groupLi.className = 'category-search-group';
        groupLi.textContent = label;
        catList.appendChild(groupLi);
        cats.forEach((cat) => {
          const li = document.createElement('li');
          li.className = 'autocomplete-item';
          li.textContent = cat.name;
          li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            catSearch.value = cat.name;
            catId.value = cat.id;
            catList.innerHTML = '';
          });
          catList.appendChild(li);
        });
      };

      appendGroup('Despesas', expenses);
      appendGroup('Receitas', incomes);
      _positionDropdown(catList, catSearch);
    };

    catSearch.addEventListener('focus', () => renderCategoryList(catSearch.value));
    catSearch.addEventListener('input', () => {
      catId.value = '';
      renderCategoryList(catSearch.value);
    });
    catSearch.addEventListener('blur', () => {
      setTimeout(() => { catList.innerHTML = ''; }, 150);
    });

    // ── Name autocomplete ──────────────────────────────────────────────────────
    const nameInput = row.querySelector('.bulk-name');
    const nameList = row.querySelector('.bulk-name-list');

    nameInput.addEventListener('input', () => {
      const q = nameInput.value.toLowerCase().trim();
      nameList.innerHTML = '';
      if (!q) return;
      const matches = commonRecordNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
      matches.forEach((name) => {
        const li = document.createElement('li');
        li.className = 'autocomplete-item';
        li.textContent = name;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
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

    // ── Reposition open dropdowns on scroll / resize ───────────────────────────
    const tableWrap = container.querySelector('.bulk-table-wrap');
    const onReposition = () => {
      if (catList.children.length > 0) _positionDropdown(catList, catSearch);
      if (nameList.children.length > 0) _positionDropdown(nameList, nameInput);
    };
    tableWrap.addEventListener('scroll', onReposition);
    window.addEventListener('scroll', onReposition, { passive: true });
    window.addEventListener('resize', onReposition, { passive: true });

    row.querySelector('.bulk-row__remove').addEventListener('click', () => {
      tableWrap.removeEventListener('scroll', onReposition);
      window.removeEventListener('scroll', onReposition);
      window.removeEventListener('resize', onReposition);
      row.remove();
      _updateRowNumbers();
    });

    // ── Date hints (future month warning + current-month suggestion) ───────────
    const dateInput = row.querySelector('.bulk-date');
    const futureWarning = row.querySelector('.bulk-date-future-warning');
    const futureMonthLabel = row.querySelector('.bulk-date-future-month-label');
    const currentMonthSuggestion = row.querySelector('.bulk-current-month-suggestion');
    const currentMonthLabel = row.querySelector('.bulk-current-month-label');
    const currentMonthCheckbox = row.querySelector('.bulk-current-month');

    dateInput.value = new Date().toISOString().slice(0, 10);

    const updateDateHints = () => {
      const dateStr = dateInput.value;
      const isFutureMonth = dateStr && _settings?.currentMonth && dateStr.slice(0, 7) > _settings.currentMonth;
      futureWarning.style.display = isFutureMonth ? '' : 'none';
      dateInput.classList.toggle('input--warning', !!isFutureMonth);
      if (isFutureMonth) {
        futureMonthLabel.textContent = formatMonthLabel(dateStr.slice(0, 7));
      }
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

    // ── Recurring / Installment mutual exclusion ───────────────────────────────
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
  }

  function _collectRowData(row) {
    return {
      categoryId: row.querySelector('.bulk-cat-id').value,
      name: row.querySelector('.bulk-name').value.trim(),
      date: row.querySelector('.bulk-date').value,
      rawValue: row.querySelector('.bulk-value').value.trim(),
      isRecurring: row.querySelector('.bulk-recurring').checked,
      isInstallment: row.querySelector('.bulk-installment').checked,
      installmentCount: parseInt(row.querySelector('.bulk-count').value, 10),
      useCurrentMonth: row.querySelector('.bulk-current-month').checked,
    };
  }

  function _applyRowErrors(row, errors) {
    row.querySelector('.bulk-cat-error').style.display = errors.categoryId ? '' : 'none';
    row.querySelector('.bulk-name-error').style.display = errors.name ? '' : 'none';
    row.querySelector('.bulk-date-error').style.display = errors.date ? '' : 'none';
    row.querySelector('.bulk-value-error').style.display = errors.value ? '' : 'none';
    row.querySelector('.bulk-count-error').style.display = errors.installmentCount ? '' : 'none';
    row.classList.toggle('bulk-row--error', Object.keys(errors).length > 0);
  }

  async function _handleSave() {
    const rows = Array.from(rowsContainer.querySelectorAll('.bulk-row'));
    if (rows.length === 0) {
      onBack();
      return;
    }

    let allValid = true;
    for (const row of rows) {
      const data = _collectRowData(row);
      const errors = validateRowData(data);
      _applyRowErrors(row, errors);
      if (Object.keys(errors).length > 0) allValid = false;
    }
    if (!allValid) return;

    console.group(`[Bulk Add] Saving ${rows.length} record(s)`);
    for (const row of rows) {
      const data = _collectRowData(row);
      const catName = categories.find((c) => c.id === data.categoryId)?.name ?? data.categoryId;
      console.log(`  ${data.name} | ${data.rawValue} | ${data.date} | category: ${catName} | recurring: ${data.isRecurring} | installment: ${data.isInstallment}${data.isInstallment ? ` (${data.installmentCount}x)` : ''}`);
      const month = data.useCurrentMonth ? _settings.currentMonth : data.date.slice(0, 7);
      if (!_settings.currentMonth) {
        _settings = await saveSettings({ ..._settings, currentMonth: month });
      }

      if (data.isInstallment) {
        await saveInstallmentGroup(
          {
            categoryId: data.categoryId,
            value: data.rawValue,
            name: data.name,
            date: data.date,
            registeredInCurrentMonth: data.useCurrentMonth,
            currentMonthOverride: _settings.currentMonth,
          },
          data.installmentCount
        );
      } else {
        await saveRecord({
          categoryId: data.categoryId,
          value: data.rawValue,
          name: data.name,
          date: data.date,
          month: data.useCurrentMonth ? _settings.currentMonth : undefined,
          isRecurring: data.isRecurring,
          registeredInCurrentMonth: data.useCurrentMonth,
        });
      }

      await addCommonRecordName(data.name);
    }
    console.groupEnd();
    console.log(`[BulkAdd] ${rows.length} registros adicionados com sucesso`);

    onBack();
  }
}

export { renderBulkAddPage, validateRowData, filterCategories };
