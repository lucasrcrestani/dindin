import { importData } from '../services/importExportService.js';
import { setState } from '../store/appState.js';

/**
 * Renders the empty-state view into the given container.
 * @param {HTMLElement} container
 * @param {{ onCreateCategory: () => void }} callbacks
 */
function renderEmptyState(container, { onCreateCategory }) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">💰</div>
      <h2 class="empty-state__title">Bem-vindo ao DinDin!</h2>
      <p class="empty-state__subtitle">Comece criando suas categorias ou carregando um arquivo salvo.</p>
      <div class="empty-state__actions">
        <button class="btn btn--primary" id="btn-create-category">Nova Categoria</button>
        <button class="btn btn--secondary" id="btn-load-json">Carregar JSON</button>
      </div>
    </div>
    <input type="file" id="file-input-json" accept=".json" style="display:none" />
  `;

  container.querySelector('#btn-create-category').addEventListener('click', onCreateCategory);

  const fileInput = container.querySelector('#file-input-json');
  container.querySelector('#btn-load-json').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importData(file);
      setState({ currentView: 'main' });
      window.dispatchEvent(new CustomEvent('dindin:reload'));
    } catch (err) {
      alert(`Erro ao carregar arquivo: ${err.message}`);
    }
  });
}

export { renderEmptyState };
