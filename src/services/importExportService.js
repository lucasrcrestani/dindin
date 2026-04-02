import { getAllCategories, saveCategory, deleteCategory } from './categoryService.js';
import { getAllRecords, saveRecord, deleteRecord } from './recordService.js';
import { getSettings, saveSettings } from './settingsService.js';
import { getAllCommonRecordNames, addCommonRecordName } from './commonRecordNameService.js';

async function exportData() {
  const [categories, records, settings, commonRecordNames] = await Promise.all([
    getAllCategories(),
    getAllRecords(),
    getSettings(),
    getAllCommonRecordNames(),
  ]);

  const payload = { categories, records, settings, commonRecordNames };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dindin-${settings.currentMonth ?? 'backup'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Arquivo JSON inválido.');
  }

  const { categories = [], records = [], settings, commonRecordNames = [] } = payload;

  await Promise.all(categories.map((c) => saveCategory(c)));
  await Promise.all(records.map((r) => saveRecord(r)));
  if (settings) await saveSettings(settings);
  for (const entry of commonRecordNames) {
    await addCommonRecordName(entry.name);
  }
}

export { exportData, importData };
