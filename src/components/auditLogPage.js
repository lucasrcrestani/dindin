import { getAllCategories } from '../services/categoryService.js';
import { getAllRecords } from '../services/recordService.js';

const ENTITY_LABEL = { record: 'Registro', category: 'Categoria' };

/**
 * Render the creation history page into the given container.
 * @param {HTMLElement} container
 * @param {{ onBack: () => void }} callbacks
 */
async function renderAuditLogPage(container, { onBack }) {
  container.innerHTML = `
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

  container.querySelector('#btn-audit-back').addEventListener('click', onBack);

  const [categories, records] = await Promise.all([getAllCategories(), getAllRecords()]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const allEntries = [
    ...categories.map((c) => ({
      entityType: 'category',
      name: c.name,
      createdAt: c.createdAt ?? new Date().toISOString(),
    })),
    ...records.map((r) => ({
      entityType: 'record',
      name: r.name,
      createdAt: r.createdAt,
      categoryName: categoryMap[r.categoryId] ?? null,
    })),
  ].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));

  let activeType = 'all';

  function applyFilters() {
    const filtered =
      activeType === 'all' ? allEntries : allEntries.filter((e) => e.entityType === activeType);
    renderList(filtered);
  }

  container.querySelector('#audit-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    container.querySelectorAll('[data-filter="type"]').forEach((b) =>
      b.classList.remove('audit-filter-btn--active'),
    );
    btn.classList.add('audit-filter-btn--active');
    activeType = btn.dataset.value;
    applyFilters();
  });

  function renderList(entries) {
    const list = container.querySelector('#audit-list');

    if (!entries.length) {
      list.innerHTML = `<p class="text-muted text-center audit-empty">Nenhum item encontrado.</p>`;
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
  }

  applyFilters();
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
