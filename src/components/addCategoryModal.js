import RecordType from '../models/RecordType.js';
import { saveCategory } from '../services/categoryService.js';

/**
 * Open the add/edit category modal.
 * @param {{ onSaved: (category: object) => void, initial?: object }} options
 */
function openCategoryModal({ onSaved, initial = null }) {
  const isEdit = !!initial;

  const initialTagsHtml = (isEdit ? (initial.tags ?? []) : [])
    .map(t => `<span class="tag-badge tag-badge--removable" data-tag="${escapeAttr(t)}">${escapeHtml(t)}<button type="button" class="tag-badge__remove" aria-label="Remover tag">&times;</button></span>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-cat-title">
      <div class="modal__header">
        <h2 id="modal-cat-title" class="modal__title">${isEdit ? 'Editar Categoria' : 'Nova Categoria'}</h2>
        <button class="btn-icon modal__close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal__body">
        <form id="form-category" novalidate>
          <div class="form-group">
            <label for="cat-name">Nome</label>
            <input id="cat-name" type="text" placeholder="Ex.: Alimentação" required
              value="${isEdit ? escapeAttr(initial.name) : ''}" />
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
            <input id="cat-ideal" type="number" min="0" step="0.01" placeholder="0,00"
              value="${isEdit ? initial.idealValue : ''}" />
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

  document.getElementById('modals').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const close = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#btn-cat-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const tagsContainer = overlay.querySelector('#cat-tags-container');
  const tagTextField = overlay.querySelector('#cat-tags');

  const addTag = (value) => {
    const tag = value.trim();
    if (!tag) return;
    const existing = tagsContainer.querySelectorAll('[data-tag]');
    for (const el of existing) {
      if (el.dataset.tag === tag) return;
    }
    const badge = document.createElement('span');
    badge.className = 'tag-badge tag-badge--removable';
    badge.dataset.tag = tag;
    badge.innerHTML = `${escapeHtml(tag)}<button type="button" class="tag-badge__remove" aria-label="Remover tag">&times;</button>`;
    badge.querySelector('.tag-badge__remove').addEventListener('click', () => badge.remove());
    tagsContainer.insertBefore(badge, tagTextField);
    tagTextField.value = '';
  };

  tagTextField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (tagTextField.value.trim()) {
        e.preventDefault();
        addTag(tagTextField.value);
      }
    } else if (e.key === 'Backspace' && tagTextField.value === '') {
      const badges = tagsContainer.querySelectorAll('[data-tag]');
      if (badges.length) badges[badges.length - 1].remove();
    }
  });

  tagTextField.addEventListener('input', () => {
    if (tagTextField.value.includes(',')) {
      const parts = tagTextField.value.split(',');
      parts.slice(0, -1).forEach(p => addTag(p));
      tagTextField.value = parts[parts.length - 1].trimStart();
    }
  });

  tagsContainer.addEventListener('click', () => tagTextField.focus());

  // Wire remove buttons on pre-populated tags
  tagsContainer.querySelectorAll('.tag-badge__remove').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('[data-tag]').remove());
  });

  overlay.querySelector('#form-category').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = overlay.querySelector('#cat-name').value.trim();
    if (!name) {
      overlay.querySelector('#cat-name').focus();
      return;
    }
    const recordType = overlay.querySelector('#cat-type').value;
    const idealValue = parseFloat(overlay.querySelector('#cat-ideal').value) || 0;
    if (tagTextField.value.trim()) addTag(tagTextField.value);
    const tags = [...tagsContainer.querySelectorAll('[data-tag]')].map(el => el.dataset.tag);

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
    close();
    onSaved(saved);
  });
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
