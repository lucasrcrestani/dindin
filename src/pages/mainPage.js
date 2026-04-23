import { getSettings, saveSettings } from '../services/settingsService.js';
import { getAllCategories } from '../services/categoryService.js';
import { getRecordsByMonth } from '../services/recordService.js';
import { getAllCommonRecordNames } from '../services/commonRecordNameService.js';
import { renderEmptyState } from '../components/emptyState.js';
import { renderGeneralBalance } from '../components/generalBalance.js';
import { renderFloatingButton } from '../components/floatingButton.js';
import { renderCategoryListPage } from '../components/categoryListPage.js';
import { openCategoryModal } from '../components/addCategoryModal.js';
import { openAddRecordModal } from '../components/addRecordModal.js';
import { openHistoryModal } from '../components/historyModal.js';
import { openCategoryDetailModal } from '../components/categoryDetailModal.js';
import { incrementMonth, getPeriodMonths } from '../utils/dateUtils.js';
import { computeHistoricalAverages } from '../utils/balanceUtils.js';

const main = document.getElementById('app-main');

let _categories = [];
let _settings = null;
let _fab = null;

async function loadData() {
  const [settings, categories] = await Promise.all([getSettings(), getAllCategories()]);
  _settings = settings;
  _categories = categories;
}

async function renderMain() {
  await loadData();

  const hasCategories = _categories.length > 0;
  const hasMonth = !!_settings.currentMonth;

  if (!hasCategories) {
    if (_fab) { _fab.destroy(); _fab = null; }
    renderEmptyState(main, {
      onCreateCategory: () => openCategoryModal({ onSaved: () => renderMain() }),
    });
    return;
  }

  // Load records for current month and period months
  const monthKey = _settings.currentMonth ?? null;
  const periodMonths = monthKey ? getPeriodMonths(monthKey, _settings.period ?? 3) : [];
  const [currentMonthRecords, ...pastRecordsArr] = await Promise.all([
    monthKey ? getRecordsByMonth(monthKey) : Promise.resolve([]),
    ...periodMonths.filter((m) => m !== monthKey).map((m) => getRecordsByMonth(m)),
    getAllCommonRecordNames(),
  ]);
  const commonRecordNames = pastRecordsArr.pop().map((e) => e.name);
  const records = currentMonthRecords;

  const recordsByMonth = new Map();
  recordsByMonth.set(monthKey, records);
  periodMonths.filter((m) => m !== monthKey).forEach((m, i) => recordsByMonth.set(m, pastRecordsArr[i]));
  const categoryAverages = computeHistoricalAverages(_categories, recordsByMonth, periodMonths);

  renderGeneralBalance(main, {
    categories: _categories,
    records,
    monthKey: monthKey ?? '',
    categoryAverages,
    onCategoryClick: (balance) => openCategoryDetailModal({
      category: balance.category,
      month: monthKey,
      records,
      allCategories: _categories,
      commonRecordNames,
      settings: _settings,
      onChanged: renderMain,
    }),
  });

  // Bottom bar events
  main.querySelector('#btn-history')?.addEventListener('click', () => {
    openHistoryModal({ categories: _categories, settings: _settings });
  });

  main.querySelector('#btn-finish-month')?.addEventListener('click', async () => {
    if (!_settings.currentMonth) {
      alert('Nenhum mês ativo para encerrar.');
      return;
    }
    if (!confirm(`Encerrar ${_settings.currentMonth} e avançar para o próximo mês?`)) return;
    const next = incrementMonth(_settings.currentMonth);
    _settings = await saveSettings({ ..._settings, currentMonth: next });
    await renderMain();
  });

  // Floating action button
  if (!_fab) {
    _fab = renderFloatingButton({
      onAdd: () => showAddPopup(commonRecordNames),
    });
  }
}

function showAddPopup(commonRecordNames) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="action-sheet" role="menu">
      <button class="action-sheet__item" id="popup-add-record">Novo Lançamento</button>
      <button class="action-sheet__item" id="popup-add-category">Nova Categoria</button>
      <button class="action-sheet__item" id="popup-manage-categories">Gerenciar Categorias</button>
      <button class="action-sheet__item action-sheet__item--cancel" id="popup-cancel">Cancelar</button>
    </div>
  `;
  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const closePopup = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });
  overlay.querySelector('#popup-cancel').addEventListener('click', closePopup);

  overlay.querySelector('#popup-add-record').addEventListener('click', () => {
    closePopup();
    openAddRecordModal({
      categories: _categories,
      commonRecordNames,
      settings: _settings,
      onSaved: async (record, updatedSettings) => {
        if (updatedSettings) _settings = updatedSettings;
        await renderMain();
      },
    });
  });

  overlay.querySelector('#popup-add-category').addEventListener('click', () => {
    closePopup();
    openCategoryModal({ onSaved: () => renderMain() });
  });

  overlay.querySelector('#popup-manage-categories').addEventListener('click', () => {
    closePopup();
    if (_fab) { _fab.destroy(); _fab = null; }
    renderCategoryListPage(main, {
      onBack: () => renderMain(),
      onChanged: () => {},
    });
  });
}

export { renderMain };
