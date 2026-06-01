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
  console.log('[Export] JSON exportado:', anchor.download, `(${payload.records?.length ?? 0} registros, ${payload.categories?.length ?? 0} categorias)`);
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
  console.log('[Import] Dados importados:', `(${payload.records?.length ?? 0} registros, ${payload.categories?.length ?? 0} categorias)`);
}

/** Returns the maximum updatedAt (falling back to createdAt) ISO string among all records, or null. */
function _getMaxTimestamp(records = []) {
  if (!records.length) return null;
  return records.reduce((max, r) => {
    const ts = r.updatedAt ?? r.createdAt ?? '';
    return ts > max ? ts : max;
  }, '');
}

/** @deprecated Use _getMaxTimestamp instead. Kept for backward compatibility. */
function _getMaxCreatedAt(records = []) {
  if (!records.length) return null;
  return records.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), records[0].createdAt);
}

/**
 * Returns true if the incoming payload has records newer than the local payload.
 * Comparison uses the maximum `updatedAt` (falling back to `createdAt`) across all records.
 */
function isPayloadNewer(incomingPayload, localPayload) {
  const incomingMax = _getMaxTimestamp(incomingPayload.records ?? []);
  const localMax    = _getMaxTimestamp(localPayload.records ?? []);
  if (!incomingMax) return false;
  if (!localMax)    return true;
  return incomingMax > localMax;
}

/**
 * Returns true if both payloads share the same maximum timestamp,
 * meaning neither has data newer than the other.
 */
function arePayloadsInSync(payloadA, payloadB) {
  return _getMaxTimestamp(payloadA.records ?? []) === _getMaxTimestamp(payloadB.records ?? []);
}

/**
 * Returns the maximum updatedAt/createdAt timestamp string across all records in a payload,
 * or null if the payload has no records. Used for logging sync decisions.
 */
function getPayloadTimestamp(payload) {
  return _getMaxTimestamp(payload.records ?? []);
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

export { getExportPayload, importDataFromObject, exportData, importData, isPayloadNewer, arePayloadsInSync, getPayloadTimestamp, parseImportFile };
