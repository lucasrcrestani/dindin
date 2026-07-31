import { getAllCategories } from '../services/categoryService.js';
import { getAllRecords } from '../services/recordService.js';
import { findBestMatchingCategory } from '../utils/balanceUtils.js';
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

    const [categories, records] = await Promise.all([getAllCategories(), getAllRecords()]);
    const allEntries = [
      ...categories.map((category) => ({
        entityType: 'category',
        name: category.name,
        createdAt: category.createdAt ?? new Date().toISOString(),
      })),
      ...records.map((record) => ({
        entityType: 'record',
        name: record.name,
        createdAt: record.createdAt,
        categoryName: findBestMatchingCategory(record, categories)?.name ?? null,
      })),
    ].sort((left, right) => (left.createdAt > right.createdAt ? -1 : 1));

    let activeType = 'all';
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
        items.forEach((entry) => groupEl.appendChild(createEntryEl(entry)));
        list.appendChild(groupEl);
      });
    };

    const applyFilters = () => {
      const filtered = activeType === 'all' ? allEntries : allEntries.filter((entry) => entry.entityType === activeType);
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

  el.innerHTML = `
    <div class="audit-entry__icon">&#10133;</div>
    <div class="audit-entry__body">
      <div class="audit-entry__main">
        <span class="audit-entry__name">${escapeHtml(entry.name)}</span>
        <span class="audit-badge audit-badge--${entry.entityType}">${escapeHtml(entityLabel)}</span>
      </div>
      ${subtitle}
    </div>
    <div class="audit-entry__time">${escapeHtml(time)}</div>
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
