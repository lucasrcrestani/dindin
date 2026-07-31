import { getAllRawCategories } from './categoryService.js';
import { getAllRawRecords } from './recordService.js';
import { getSettings, saveSettings } from './settingsService.js';
import { getAllCommonRecordNames } from './commonRecordNameService.js';
import { getStore, promisify, STORES } from './db.js';
import { createTag } from '../models/Tag.js';
import { normalizeTagName, uniqueTagIds } from './tagService.js';

function isLegacyPayload(payload) {
  const categories = payload.categories ?? [];
  const records = payload.records ?? [];
  return !Array.isArray(payload.tags) ||
    categories.some((category) => Array.isArray(category.tags)) ||
    records.some((record) => record.categoryId || Array.isArray(record.tags));
}

function normalizeImportPayload(payload = {}) {
  if (!isLegacyPayload(payload)) {
    return {
      categories: payload.categories ?? [],
      records: payload.records ?? [],
      tags: payload.tags ?? [],
      settings: payload.settings,
      commonRecordNames: payload.commonRecordNames ?? [],
    };
  }

  const tagsByNormalizedName = new Map();
  const categories = payload.categories ?? [];
  const records = payload.records ?? [];

  (payload.tags ?? []).forEach((tag) => {
    const normalizedName = normalizeTagName(tag.name);
    if (!normalizedName || tagsByNormalizedName.has(normalizedName)) return;
    tagsByNormalizedName.set(normalizedName, tag);
  });

  const ensureTagId = (tagName) => {
    const name = String(tagName ?? '').trim();
    const normalizedName = normalizeTagName(name);
    if (!normalizedName) return null;

    const existingTag = tagsByNormalizedName.get(normalizedName);
    if (existingTag) return existingTag.id;

    const tag = createTag({ name });
    tagsByNormalizedName.set(normalizedName, tag);
    return tag.id;
  };

  const categoryMetaById = new Map();
  const normalizedCategories = categories.map((category) => {
    const tagIds = Array.isArray(category.tagIds) && category.tagIds.length > 0
      ? uniqueTagIds(category.tagIds)
      : uniqueTagIds((category.tags ?? []).map((tag) => ensureTagId(tag)).filter(Boolean));
    const normalizedCategory = { ...category, tagIds };
    delete normalizedCategory.tags;
    categoryMetaById.set(normalizedCategory.id, {
      recordType: normalizedCategory.recordType,
      tagIds,
    });
    return normalizedCategory;
  });

  const normalizedRecords = records.map((record) => {
    const categoryMeta = record.categoryId ? categoryMetaById.get(record.categoryId) : null;
    const ownTagIds = Array.isArray(record.tagIds) && record.tagIds.length > 0
      ? uniqueTagIds(record.tagIds)
      : uniqueTagIds((record.tags ?? []).map((tag) => ensureTagId(tag)).filter(Boolean));
    const normalizedRecord = {
      ...record,
      recordType: record.recordType ?? categoryMeta?.recordType ?? null,
      tagIds: uniqueTagIds([...(categoryMeta?.tagIds ?? []), ...ownTagIds]),
    };
    delete normalizedRecord.tags;
    delete normalizedRecord.categoryId;
    return normalizedRecord;
  });

  return {
    categories: normalizedCategories,
    records: normalizedRecords,
    tags: [...tagsByNormalizedName.values()],
    settings: payload.settings,
    commonRecordNames: payload.commonRecordNames ?? [],
  };
}

/** Returns all data as a plain object without triggering a file download. */
async function getExportPayload() {
  const [categories, records, tags, settings, commonRecordNames] = await Promise.all([
    getAllRawCategories(),
    getAllRawRecords(),
    promisify(getStore(STORES.TAGS).getAll()),
    getSettings(),
    getAllCommonRecordNames(),
  ]);
  return { categories, records, tags, settings, commonRecordNames };
}

/**
 * Replaces all local data with the provided payload object.
 * Existing IDs are preserved (direct put, not addCommonRecordName).
 */
async function importDataFromObject(payload = {}) {
  const { categories = [], records = [], tags = [], settings, commonRecordNames = [] } = normalizeImportPayload(payload);

  // Clear all stores before restoring so import is a full replace, not a merge
  await promisify(getStore(STORES.COMMON_RECORD_NAMES, 'readwrite').clear());
  await promisify(getStore(STORES.RECORDS, 'readwrite').clear());
  await promisify(getStore(STORES.CATEGORIES, 'readwrite').clear());
  await promisify(getStore(STORES.TAGS, 'readwrite').clear());
  await promisify(getStore(STORES.SETTINGS, 'readwrite').clear());

  await Promise.all(tags.map((tag) => promisify(getStore(STORES.TAGS, 'readwrite').put(tag))));
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
  const normalizedPayload = normalizeImportPayload(payload);
  return { payload: normalizedPayload, isNewer: isPayloadNewer(normalizedPayload, localPayload) };
}

export {
  getExportPayload,
  importDataFromObject,
  exportData,
  importData,
  isPayloadNewer,
  arePayloadsInSync,
  getPayloadTimestamp,
  parseImportFile,
  normalizeImportPayload,
};
