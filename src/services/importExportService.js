import { getAllCategories, saveCategory } from './categoryService.js';
import { getAllRecords, saveRecord } from './recordService.js';
import { getSettings, saveSettings } from './settingsService.js';
import { getAllCommonRecordNames } from './commonRecordNameService.js';
import { getStore, promisify, STORES } from './db.js';

/** Returns all data as a plain object without triggering a file download. */
async function getExportPayload() {
  const [categories, records, settings, commonRecordNames] = await Promise.all([
    getAllCategories(),
    getAllRecords(),
    getSettings(),
    getAllCommonRecordNames(),
  ]);
  return { categories, records, settings, commonRecordNames };
}

/**
 * Replaces all local data with the provided payload object.
 * Existing IDs are preserved (direct put, not addCommonRecordName).
 */
async function importDataFromObject({ categories = [], records = [], settings, commonRecordNames = [] }) {
  // Clear all stores before restoring so import is a full replace, not a merge
  await promisify(getStore(STORES.COMMON_RECORD_NAMES, 'readwrite').clear());
  await promisify(getStore(STORES.RECORDS, 'readwrite').clear());
  await promisify(getStore(STORES.CATEGORIES, 'readwrite').clear());
  await promisify(getStore(STORES.SETTINGS, 'readwrite').clear());

  await Promise.all(categories.map((c) => saveCategory(c)));
  await Promise.all(records.map((r) => saveRecord(r)));
  if (settings) await saveSettings(settings);
  await Promise.all(
    commonRecordNames.map((n) => promisify(getStore(STORES.COMMON_RECORD_NAMES, 'readwrite').put(n))),
  );
}

async function exportData() {
  const payload = await getExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dindin-${payload.settings?.currentMonth ?? 'backup'}.json`;
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
  await importDataFromObject(payload);
}

export { getExportPayload, importDataFromObject, exportData, importData };
