import RecordType from '../models/RecordType.js';
import { saveCategory } from '../services/categoryService.js';

/**
 * Open the add/edit category modal.
 * @param {{ onSaved: (category: object) => void, initial?: object }} options
 */
function openCategoryModal({ onSaved, initial = null }) {
  const isEdit = !!initial;

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
            <label for="cat-tags">Tags (separadas por vírgula)</label>
            <input id="cat-tags" type="text" placeholder="Ex.: fixo, essencial"
              value="${isEdit ? (initial.tags ?? []).join(', ') : ''}" />
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

  overlay.querySelector('#form-category').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = overlay.querySelector('#cat-name').value.trim();
    if (!name) {
      overlay.querySelector('#cat-name').focus();
      return;
    }
    const recordType = overlay.querySelector('#cat-type').value;
    const idealValue = parseFloat(overlay.querySelector('#cat-ideal').value) || 0;
    const tagsRaw = overlay.querySelector('#cat-tags').value;
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

    const data = { name, recordType, idealValue, tags };
    if (isEdit) data.id = initial.id;

    const saved = await saveCategory(data);
    close();
    onSaved(saved);
  });
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

export { openCategoryModal };
