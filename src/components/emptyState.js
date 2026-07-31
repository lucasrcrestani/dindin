import { parseImportFile, importDataFromObject } from '../services/importExportService.js';
import { setState } from '../store/appState.js';
import { BaseComponent } from './baseComponent.js';

class DindinEmptyState extends BaseComponent {
  render() {
    const { onCreateCategory } = this.data;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
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

    wrapper.querySelector('#btn-create-category').addEventListener('click', () => {
      if (onCreateCategory) onCreateCategory();
    });

    const fileInput = wrapper.querySelector('#file-input-json');
    wrapper.querySelector('#btn-load-json').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const { payload, isNewer } = await parseImportFile(file);
        if (!isNewer) {
          const confirmed = window.confirm(
            'Os dados do arquivo são mais antigos ou iguais aos locais. Deseja substituir mesmo assim?'
          );
          if (!confirmed) {
            event.target.value = '';
            return;
          }
        }
        await importDataFromObject(payload);
        setState({ currentView: 'main' });
        window.dispatchEvent(new CustomEvent('dindin:reload'));
      } catch (error) {
        alert(`Erro ao carregar arquivo: ${error.message}`);
      }
    });

    this.replaceContent(wrapper);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-empty-state')) {
  customElements.define('dindin-empty-state', DindinEmptyState);
}

/**
 * Renders the empty-state view into the given container.
 * @param {HTMLElement} container
 * @param {{ onCreateCategory: () => void }} callbacks
 */
function renderEmptyState(container, { onCreateCategory }) {
  const element = document.createElement('dindin-empty-state');
  element.data = { onCreateCategory };
  container.innerHTML = '';
  container.appendChild(element);
}

export { renderEmptyState };
