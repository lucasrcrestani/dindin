import { initDB } from '../../src/services/db.js';
import { renderMain } from '../../src/pages/mainPage.js';
import { openSettingsModal } from '../../src/components/settingsModal.js';
import { renderAuditLogPage } from '../../src/components/auditLogPage.js';
import { initGoogleAuth, getStoredToken, startAutoSync } from '../../src/services/driveService.js';
import { loadPickerApi } from '../../src/services/pickerService.js';
import { renderDriveSyncButton } from '../../src/components/driveSyncButton.js';
import { getSettings } from '../../src/services/settingsService.js';
import { migrateCategoryCreatedAt, getAllCategories } from '../../src/services/categoryService.js';
import { getAllCommonRecordNames } from '../../src/services/commonRecordNameService.js';
import { renderBulkAddPage } from '../../src/components/bulkAddPage.js';

// ── Google API callbacks (must be on window; called by the async script tags) ──
window.onGapiLoad = () => {
  loadPickerApi().catch((err) => console.warn('[Picker] Failed to load:', err));
};

window.onGisLoad = async () => {
  try {
    initGoogleAuth();
    const settings = await getSettings();
    if (settings.driveConnected && settings.driveFileId && getStoredToken()) {
      startAutoSync();
    }
  } catch (err) {
    console.warn('[DriveService] GIS init error:', err);
  }
};

async function bootstrap() {
  try {
    await initDB();
    await migrateCategoryCreatedAt();
    await renderMain();
    await renderDriveSyncButton();

    document.getElementById('btn-settings').addEventListener('click', () => {
      openSettingsModal({ onSaved: () => renderMain() });
    });

    document.getElementById('btn-audit-log').addEventListener('click', () => {
      const container = document.getElementById('app-main');
      renderAuditLogPage(container, { onBack: () => renderMain() });
    });

    window.addEventListener('dindin:reload', () => renderMain());

    window.addEventListener('dindin:ofx-bulk-add', async (e) => {
      const { rows } = e.detail;
      const [settings, categories, commonRecordNameEntries] = await Promise.all([
        getSettings(),
        getAllCategories(),
        getAllCommonRecordNames(),
      ]);
      const commonRecordNames = commonRecordNameEntries.map((entry) => entry.name);
      const main = document.getElementById('app-main');
      renderBulkAddPage(main, { categories, commonRecordNames, settings, initialRows: rows, onBack: () => renderMain() });
    });

    console.log('[Bootstrap] DinDin inicializado com sucesso');
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
