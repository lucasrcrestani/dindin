import { getAllCategories } from './categoryService.js';
import { getAllRecords } from './recordService.js';
import { getSettings, saveSettings } from './settingsService.js';
import { getAllCommonRecordNames } from './commonRecordNameService.js';
import { getStore, promisify, STORES } from './db.js';

/** Returns all data as a plain object without triggering a file download. */
async function getExportPayload() {
  const [categories, records, settings, commonRecordNames, auditLog] = await Promise.all([
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

  await Promise.all(categories.map((c) => promisify(getStore(STORES.CATEGORIES, 'readwrite').put(c))));
  await Promise.all(records.map((r) => promisify(getStore(STORES.RECORDS, 'readwrite').put(r))));
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

/** Returns the maximum createdAt ISO string among all records, or null. */
function _getMaxCreatedAt(records = []) {
  if (!records.length) return null;
  return records.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), records[0].createdAt);
}

/**
 * Returns true if the incoming payload has records newer than the local payload.
 * Comparison is based on the maximum `createdAt` value across all records.
 */
function isPayloadNewer(incomingPayload, localPayload) {
  const incomingMax = _getMaxCreatedAt(incomingPayload.records ?? []);
  const localMax    = _getMaxCreatedAt(localPayload.records ?? []);
  if (!incomingMax) return false;
  if (!localMax)    return true;
  return incomingMax > localMax;
}

/**
 * Returns true if both payloads share the same maximum createdAt timestamp,
 * meaning neither has records newer than the other.
 */
function arePayloadsInSync(payloadA, payloadB) {
  return _getMaxCreatedAt(payloadA.records ?? []) === _getMaxCreatedAt(payloadB.records ?? []);
}

/**
 * Parses a JSON file and checks whether its data is newer than the local DB.
 * @returns {Promise<{ payload: object, isNewer: boolean }>}
 */
async function parseImportFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Arquivo JSON inválido.');
  }
  const localPayload = await getExportPayload();
  return { payload, isNewer: isPayloadNewer(payload, localPayload) };
}

export { getExportPayload, importDataFromObject, exportData, importData, isPayloadNewer, arePayloadsInSync, parseImportFile };
