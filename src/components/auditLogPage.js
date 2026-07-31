import { getAllCategories } from '../services/categoryService.js';
import { getAllRecords } from '../services/recordService.js';
import { getAllCommonRecordNames } from '../services/commonRecordNameService.js';
import { getSettings } from '../services/settingsService.js';
import { getTagMapById } from '../services/tagService.js';
import { findBestMatchingCategory } from '../utils/balanceUtils.js';
import { parseFormula } from '../utils/formulaUtils.js';
import { formatCurrency } from '../utils/formatters.js';
import { openAddRecordModal } from './addRecordModal.js';
import { BaseComponent } from './baseComponent.js';

const ENTITY_LABEL = { record: 'Registro', category: 'Categoria' };

class DindinAuditLogPage extends BaseComponent {
  async render() {
    const { onBack } = this.data;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="audit-log-page">
        <div class="page-header">
          <button class="btn btn--secondary" id="btn-audit-back">&#8592; Voltar</button>
          <h2 class="page-title">Hist&#243;rico de Cria&#231;&#245;es</h2>
          <div></div>
        </div>
        <div class="audit-filters" id="audit-filters">
          <div class="audit-search-row">
            <input
              id="audit-search"
              class="audit-search"
              type="search"
              placeholder="Buscar por nome, valor ou tag..."
              autocomplete="off"
            />
          </div>
          <div class="audit-filter-group">
            <span class="audit-filter-label">Tipo:</span>
            <button class="audit-filter-btn audit-filter-btn--active" data-filter="type" data-value="all">Todos</button>
            <button class="audit-filter-btn" data-filter="type" data-value="record">Registros</button>
            <button class="audit-filter-btn" data-filter="type" data-value="category">Categorias</button>
          </div>
        </div>
        <div class="audit-list" id="audit-list"></div>
      </div>
    `;

    wrapper.querySelector('#btn-audit-back').addEventListener('click', () => onBack?.());

    const [categories, records, tagMap, commonRecordNames, settings] = await Promise.all([
      getAllCategories(),
      getAllRecords(),
      getTagMapById(),
      getAllCommonRecordNames(),
      getSettings(),
    ]);

    const allEntries = [
      ...categories.map((category) => ({
        entityType: 'category',
        name: category.name,
        createdAt: category.createdAt ?? new Date().toISOString(),
      })),
      ...records.map((record) => {
        const tags = (record.tagIds ?? []).map((id) => tagMap.get(id)?.name ?? id);
        const computedValue = parseFormula(record.value);
        const isFormula = typeof record.value === 'string' && record.value.trim() !== String(computedValue);
        return {
          entityType: 'record',
          name: record.name,
          createdAt: record.createdAt,
          categoryName: findBestMatchingCategory(record, categories)?.name ?? null,
          record,
          tags,
          rawValue: String(record.value ?? ''),
          computedValue,
          isFormula,
        };
      }),
    ].sort((left, right) => (left.createdAt > right.createdAt ? -1 : 1));

    let activeType = 'all';
    let searchQuery = '';

    const matchesSearch = (entry) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      if (entry.name.toLowerCase().includes(q)) return true;
      if (entry.entityType === 'record') {
        if (entry.rawValue.toLowerCase().includes(q)) return true;
        if (entry.computedValue !== null && String(entry.computedValue).includes(q)) return true;
        if (entry.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
      }
      return false;
    };

    const openEdit = async (entry) => {
      const commonNames = commonRecordNames.map((e) => e.name);
      openAddRecordModal({
        categories,
        commonRecordNames: commonNames,
        settings,
        initial: {
          ...entry.record,
          tags: entry.tags,
          lockedTags: [],
        },
        onSaved: async () => {
          console.log('[AuditLog] Registro editado a partir do histórico:', entry.record.id);
          await this.render();
        },
      });
    };

    const renderList = (entries) => {
      const list = wrapper.querySelector('#audit-list');

      if (!entries.length) {
        list.innerHTML = '<p class="text-muted text-center audit-empty">Nenhum item encontrado.</p>';
        return;
      }

      const groups = groupByDate(entries);
      list.innerHTML = '';
      groups.forEach(({ label, items }) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'audit-date-group';
        groupEl.innerHTML = `<div class="audit-date-separator">${escapeHtml(label)}</div>`;
        items.forEach((entry) => {
          const el = createEntryEl(entry);
          if (entry.entityType === 'record') {
            el.querySelector('.audit-entry__edit')?.addEventListener('click', () => openEdit(entry));
          }
          groupEl.appendChild(el);
        });
        list.appendChild(groupEl);
      });
    };

    const applyFilters = () => {
      const filtered = allEntries.filter(
        (entry) => (activeType === 'all' || entry.entityType === activeType) && matchesSearch(entry)
      );
      renderList(filtered);
    };

    wrapper.querySelector('#audit-filters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      wrapper.querySelectorAll('[data-filter="type"]').forEach((item) => item.classList.remove('audit-filter-btn--active'));
      button.classList.add('audit-filter-btn--active');
      activeType = button.dataset.value;
      applyFilters();
    });

    wrapper.querySelector('#audit-search').addEventListener('input', (event) => {
      searchQuery = event.target.value.trim();
      applyFilters();
    });

    this.replaceContent(wrapper);
    applyFilters();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-audit-log-page')) {
  customElements.define('dindin-audit-log-page', DindinAuditLogPage);
}

/**
 * Render the creation history page into the given container.
 * @param {HTMLElement} container
 * @param {{ onBack: () => void }} callbacks
 */
async function renderAuditLogPage(container, { onBack }) {
  const page = document.createElement('dindin-audit-log-page');
  page.data = { onBack };
  container.innerHTML = '';
  container.appendChild(page);
}

function createEntryEl(entry) {
  const el = document.createElement('div');
  el.className = 'audit-entry audit-entry--created';

  const entityLabel = ENTITY_LABEL[entry.entityType] ?? entry.entityType;
  const time = formatTime(entry.createdAt);
  const subtitle =
    entry.entityType === 'record' && entry.categoryName
      ? `<span class="audit-entry__subtitle">${escapeHtml(entry.categoryName)}</span>`
      : '';

  let valueHtml = '';
  let tagsHtml = '';
  let actionsHtml = '';

  if (entry.entityType === 'record') {
    const valueLabel = entry.computedValue !== null ? formatCurrency(entry.computedValue) : escapeHtml(entry.rawValue);
    const formulaHint = entry.isFormula ? `<span class="audit-entry__formula">(${escapeHtml(entry.rawValue)})</span>` : '';
    valueHtml = `<div class="audit-entry__value">${valueLabel}${formulaHint}</div>`;

    if (entry.tags.length > 0) {
      const chips = entry.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('');
      tagsHtml = `<div class="audit-entry__tags">${chips}</div>`;
    }

    actionsHtml = `<button class="btn btn--secondary btn--sm audit-entry__edit" aria-label="Editar lançamento">✏️</button>`;
  }

  el.innerHTML = `
    <div class="audit-entry__icon">&#10133;</div>
    <div class="audit-entry__body">
      <div class="audit-entry__main">
        <span class="audit-entry__name">${escapeHtml(entry.name)}</span>
        <span class="audit-badge audit-badge--${entry.entityType}">${escapeHtml(entityLabel)}</span>
      </div>
      ${subtitle}
      ${valueHtml}
      ${tagsHtml}
    </div>
    <div class="audit-entry__side">
      <div class="audit-entry__time">${escapeHtml(time)}</div>
      ${actionsHtml}
    </div>
  `;

  return el;
}

function groupByDate(entries) {
  const map = new Map();
  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));

  for (const entry of entries) {
    const dateStr = entry.createdAt.slice(0, 10);
    let label;
    if (dateStr === today) label = 'Hoje';
    else if (dateStr === yesterday) label = 'Ontem';
    else label = formatDateLabel(dateStr);

    if (!map.has(label)) map.set(label, []);
    map.get(label).push(entry);
  }

  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(isoStr) {
  const date = new Date(isoStr);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export { renderAuditLogPage };
