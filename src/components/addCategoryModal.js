import RecordType from '../models/RecordType.js';
import { saveCategory } from '../services/categoryService.js';
import { BaseComponent } from './baseComponent.js';

class DindinAddCategoryModal extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.classList.add('modal-overlay--visible'));
  }

  close() {
    this.classList.remove('modal-overlay--visible');
    this.addEventListener('transitionend', () => this.remove(), { once: true });
  }

  render() {
    const { initial = null, onSaved } = this.data;
    const isEdit = Boolean(initial);
    const initialTagsHtml = (isEdit ? (initial.tags ?? []) : [])
      .map((tag) => `<span class="tag-badge tag-badge--removable" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}<button type="button" class="tag-badge__remove" aria-label="Remover tag">&times;</button></span>`)
      .join('');

    this.className = 'modal-overlay';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-cat-title">
        <div class="modal__header">
          <h2 id="modal-cat-title" class="modal__title">${isEdit ? 'Editar Categoria' : 'Nova Categoria'}</h2>
          <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">
          <form id="form-category" novalidate>
            <div class="form-group">
              <label for="cat-name">Nome</label>
              <input id="cat-name" type="text" placeholder="Ex.: Alimentação" required value="${isEdit ? escapeAttr(initial.name) : ''}" />
            </div>
            <div class="form-group">
              <label for="cat-type">Tipo</label>
              <select id="cat-type">
                <option value="${RecordType.EXPENSE}" ${(!isEdit || initial.recordType === RecordType.EXPENSE) ? 'selected' : ''}>Despesa</option>
                <option value="${RecordType.INCOME}" ${(isEdit && initial.recordType === RecordType.INCOME) ? 'selected' : ''}>Receita</option>
              </select>
            </div>
            <div class="form-group">
              <label for="cat-ideal">Valor Ideal (R$)</label>
              <input id="cat-ideal" type="number" min="0" step="0.01" placeholder="0,00" value="${isEdit ? initial.idealValue : ''}" />
            </div>
            <div class="form-group">
              <label>Tags</label>
              <div class="tag-input" id="cat-tags-container">
                ${initialTagsHtml}
                <input id="cat-tags" type="text" placeholder="Adicionar tag..." class="tag-input__field" autocomplete="off" />
              </div>
            </div>
            <div class="modal__footer">
              <button type="button" class="btn btn--secondary" id="btn-cat-cancel">Cancelar</button>
              <button type="submit" class="btn btn--primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const tagsContainer = wrapper.querySelector('#cat-tags-container');
    const tagTextField = wrapper.querySelector('#cat-tags');

    const addTag = (value) => {
      const tag = value.trim();
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
      tagsContainer.insertBefore(badge, tagTextField);
      tagTextField.value = '';
    };

    wrapper.querySelector('.modal__close').addEventListener('click', () => this.close());
    wrapper.querySelector('#btn-cat-cancel').addEventListener('click', () => this.close());
    this.onclick = (event) => {
      if (event.target === this) this.close();
    };

    tagTextField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (tagTextField.value.trim()) {
          event.preventDefault();
          addTag(tagTextField.value);
        }
      } else if (event.key === 'Backspace' && tagTextField.value === '') {
        const badges = tagsContainer.querySelectorAll('[data-tag]');
        if (badges.length) badges[badges.length - 1].remove();
      }
    });

    tagTextField.addEventListener('input', () => {
      if (tagTextField.value.includes(',')) {
        const parts = tagTextField.value.split(',');
        parts.slice(0, -1).forEach((part) => addTag(part));
        tagTextField.value = parts[parts.length - 1].trimStart();
      }
    });

    tagsContainer.addEventListener('click', () => tagTextField.focus());
    tagsContainer.querySelectorAll('.tag-badge__remove').forEach((button) => {
      button.addEventListener('click', () => button.closest('[data-tag]').remove());
    });

    wrapper.querySelector('#form-category').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = wrapper.querySelector('#cat-name').value.trim();
      if (!name) {
        wrapper.querySelector('#cat-name').focus();
        return;
      }
      const recordType = wrapper.querySelector('#cat-type').value;
      const idealValue = parseFloat(wrapper.querySelector('#cat-ideal').value) || 0;
      if (tagTextField.value.trim()) addTag(tagTextField.value);
      const tags = [...tagsContainer.querySelectorAll('[data-tag]')].map((element) => element.dataset.tag);

      const data = { name, recordType, idealValue, tags };
      if (isEdit) data.id = initial.id;

      console.group(isEdit ? '[Category Modal] Updating category' : '[Category Modal] Creating category');
      console.log('Name:', name);
      console.log('Type:', recordType);
      console.log('Ideal value:', idealValue);
      console.log('Tags:', tags);
      if (isEdit) console.log('ID:', initial.id);
      console.groupEnd();

      const saved = await saveCategory(data);
      console.log('[Category Modal] Category saved:', saved.id);
      this.close();
      if (onSaved) onSaved(saved);
    });

    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-add-category-modal')) {
  customElements.define('dindin-add-category-modal', DindinAddCategoryModal);
}

/**
 * Open the add/edit category modal.
 * @param {{ onSaved: (category: object) => void, initial?: object }} options
 */
function openCategoryModal({ onSaved, initial = null }) {
  const modal = document.createElement('dindin-add-category-modal');
  modal.data = { onSaved, initial };
  document.getElementById('modals').appendChild(modal);
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { openCategoryModal };
