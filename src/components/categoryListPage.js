import { getAllCategories, deleteCategory } from '../services/categoryService.js';
import { deleteRecordsByCategory } from '../services/recordService.js';
import { openCategoryModal } from './addCategoryModal.js';
import RecordType from '../models/RecordType.js';

/**
 * Render the category management list into the container.
 * @param {HTMLElement} container
 * @param {{ onBack: () => void, onChanged: () => void }} callbacks
 */
async function renderCategoryListPage(container, { onBack, onChanged }) {
  const categories = await getAllCategories();

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn--secondary" id="btn-cat-back">← Voltar</button>
      <h2 class="page-title">Categorias</h2>
      <button class="btn btn--primary" id="btn-new-cat">+ Nova</button>
    </div>
    <ul class="category-list" id="category-list"></ul>
    ${categories.length === 0 ? '<p class="text-muted text-center">Nenhuma categoria cadastrada.</p>' : ''}
  `;

  container.querySelector('#btn-cat-back').addEventListener('click', onBack);
  container.querySelector('#btn-new-cat').addEventListener('click', () => {
    openCategoryModal({
      onSaved: async () => {
        onChanged();
        await renderCategoryListPage(container, { onBack, onChanged });
      },
    });
  });

  const list = container.querySelector('#category-list');
  categories.forEach((cat) => {
    const typeLabel = cat.recordType === RecordType.INCOME ? 'Receita' : 'Despesa';
    const li = document.createElement('li');
    li.className = 'category-list-item';
    li.innerHTML = `
      <div class="category-list-item__info">
        <span class="category-list-item__name">${escapeHtml(cat.name)}</span>
        <span class="category-list-item__meta">${typeLabel} · R$ ${cat.idealValue.toFixed(2)}</span>
        ${cat.tags?.length ? `<span class="category-list-item__tags">${cat.tags.map(escapeHtml).join(', ')}</span>` : ''}
      </div>
      <div class="category-list-item__actions">
        <button class="btn btn--secondary btn--sm" data-action="edit">Editar</button>
        <button class="btn btn--danger btn--sm" data-action="delete">Excluir</button>
      </div>
    `;

    li.querySelector('[data-action="edit"]').addEventListener('click', () => {
      openCategoryModal({
        initial: cat,
        onSaved: async () => {
          onChanged();
          await renderCategoryListPage(container, { onBack, onChanged });
        },
      });
    });

    li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Excluir a categoria "${cat.name}" e todos os seus registros?`)) return;
      await deleteRecordsByCategory(cat.id);
      await deleteCategory(cat.id);
      onChanged();
      await renderCategoryListPage(container, { onBack, onChanged });
    });

    list.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { renderCategoryListPage };
