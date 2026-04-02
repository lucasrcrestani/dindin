import { initDB } from '../../src/services/db.js';
import { renderMain } from '../../src/pages/mainPage.js';
import { openSettingsModal } from '../../src/components/settingsModal.js';

async function bootstrap() {
  try {
    await initDB();
    await renderMain();

    document.getElementById('btn-settings').addEventListener('click', () => {
      openSettingsModal({ onSaved: () => renderMain() });
    });

    window.addEventListener('dindin:reload', () => renderMain());
  } catch (err) {
    console.error('Erro ao inicializar o DinDin:', err);
    document.getElementById('app-main').innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Erro ao inicializar o aplicativo</p>
        <p class="empty-state__subtitle">${err.message}</p>
      </div>
    `;
  }
}

bootstrap();
