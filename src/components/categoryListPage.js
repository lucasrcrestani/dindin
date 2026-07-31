import { getAllCategories, deleteCategory } from '../services/categoryService.js';
import { deleteRecordsByCategory } from '../services/recordService.js';
import { openCategoryModal } from './addCategoryModal.js';
import RecordType from '../models/RecordType.js';
import { BaseComponent } from './baseComponent.js';

class DindinCategoryListPage extends BaseComponent {
  async render() {
    const { onBack, onChanged } = this.data;
    const categories = await getAllCategories();

    console.group('[Category List Page]');
    console.log('Total categories:', categories.length);
    categories.forEach((category) => console.log(`  ${category.name} | ${category.recordType} | R$ ${category.idealValue.toFixed(2)} | tags: [${(category.tags ?? []).join(', ')}]`));
    console.groupEnd();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="page-header">
        <button class="btn btn--secondary" id="btn-cat-back">← Voltar</button>
        <h2 class="page-title">Categorias</h2>
        <button class="btn btn--primary" id="btn-new-cat">+ Nova</button>
      </div>
      <ul class="category-list" id="category-list"></ul>
      ${categories.length === 0 ? '<p class="text-muted text-center">Nenhuma categoria cadastrada.</p>' : ''}
    `;

    wrapper.querySelector('#btn-cat-back').addEventListener('click', () => onBack?.());
    wrapper.querySelector('#btn-new-cat').addEventListener('click', () => {
      openCategoryModal({
        onSaved: async () => {
          onChanged?.();
          await this.render();
        },
      });
    });

    const list = wrapper.querySelector('#category-list');
    categories.forEach((category) => {
      const typeLabel = category.recordType === RecordType.INCOME ? 'Receita' : 'Despesa';
      const li = document.createElement('li');
      li.className = 'category-list-item';
      li.innerHTML = `
        <div class="category-list-item__info">
          <span class="category-list-item__name">${escapeHtml(category.name)}</span>
          <span class="category-list-item__meta">${typeLabel} · R$ ${category.idealValue.toFixed(2)}</span>
          ${category.tags?.length ? `<span class="category-list-item__tags">${category.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}</span>` : ''}
        </div>
        <div class="category-list-item__actions">
          <button class="btn btn--secondary btn--sm" data-action="edit">Editar</button>
          <button class="btn btn--danger btn--sm" data-action="delete">Excluir</button>
        </div>
      `;

      li.querySelector('[data-action="edit"]').addEventListener('click', () => {
        console.log('[Category List Page] Opening edit for category:', category.name, '|', category.id);
        openCategoryModal({
          initial: category,
          onSaved: async () => {
            onChanged?.();
            await this.render();
          },
        });
      });

      li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Excluir a categoria "${category.name}" e todos os seus registros?`)) return;
        console.log('[Category List Page] Deleting category:', category.name, '|', category.id);
        await deleteRecordsByCategory(category.id);
        await deleteCategory(category.id);
        onChanged?.();
        await this.render();
      });

      list.appendChild(li);
    });

    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-category-list-page')) {
  customElements.define('dindin-category-list-page', DindinCategoryListPage);
}

/**
 * Render the category management list into the container.
 * @param {HTMLElement} container
 * @param {{ onBack: () => void, onChanged: () => void }} callbacks
 */
async function renderCategoryListPage(container, { onBack, onChanged }) {
  const page = document.createElement('dindin-category-list-page');
  page.data = { onBack, onChanged };
  container.innerHTML = '';
  container.appendChild(page);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { renderCategoryListPage };
