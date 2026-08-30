const DB_NAME = 'dindin';
const DB_VERSION = 7;

const STORES = {
  CATEGORIES: 'categories',
  RECORDS: 'records',
  TAGS: 'tags',
  SETTINGS: 'settings',
  COMMON_RECORD_NAMES: 'commonRecordNames',
  AUDIT_LOG: 'auditLog',
};

function normalizeTagName(name) {
  return String(name ?? '').trim().toLowerCase();
}

function generateUpgradeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureTag(rawTag, tagStore, tagIdsByName, now) {
  const name = String(rawTag ?? '').trim();
  if (!name) return null;

  const normalizedName = normalizeTagName(name);
  const existingId = tagIdsByName.get(normalizedName);
  if (existingId) return existingId;

  const id = generateUpgradeId();
  tagStore.put({
    id,
    name,
    normalizedName,
    createdAt: now,
    updatedAt: now,
  });
  tagIdsByName.set(normalizedName, id);
  return id;
}

function migrateLegacyTagsAndRecords(upgradeTx) {
  const now = new Date().toISOString();
  const categoryStore = upgradeTx.objectStore(STORES.CATEGORIES);
  const recordStore = upgradeTx.objectStore(STORES.RECORDS);
  const tagStore = upgradeTx.objectStore(STORES.TAGS);
  const tagIdsByName = new Map();
  const categoryMetaById = new Map();

  categoryStore.openCursor().onsuccess = (categoryEvent) => {
    const categoryCursor = categoryEvent.target.result;
    if (categoryCursor) {
      const category = categoryCursor.value;
      const legacyTags = Array.isArray(category.tagIds) ? [] : (category.tags ?? []);
      const tagIds = Array.isArray(category.tagIds)
        ? [...new Set(category.tagIds.filter(Boolean))]
        : [...new Set(legacyTags.map((tag) => ensureTag(tag, tagStore, tagIdsByName, now)).filter(Boolean))];

      const migratedCategory = {
        ...category,
        tagIds,
        updatedAt: category.updatedAt ?? category.createdAt ?? now,
      };
      delete migratedCategory.tags;

      categoryMetaById.set(migratedCategory.id, {
        recordType: migratedCategory.recordType,
        tagIds,
      });
      categoryCursor.update(migratedCategory);
      categoryCursor.continue();
      return;
    }

    recordStore.openCursor().onsuccess = (recordEvent) => {
      const recordCursor = recordEvent.target.result;
      if (!recordCursor) return;

      const record = recordCursor.value;
      const categoryMeta = record.categoryId ? categoryMetaById.get(record.categoryId) : null;
      const legacyTags = Array.isArray(record.tagIds) ? [] : (record.tags ?? []);
      const inheritedTagIds = categoryMeta?.tagIds ?? [];
      const ownTagIds = Array.isArray(record.tagIds)
        ? record.tagIds.filter(Boolean)
        : legacyTags.map((tag) => ensureTag(tag, tagStore, tagIdsByName, now)).filter(Boolean);
      const tagIds = [...new Set([...inheritedTagIds, ...ownTagIds])];

      const migratedRecord = {
        ...record,
        recordType: record.recordType ?? categoryMeta?.recordType ?? null,
        tagIds,
        updatedAt: record.updatedAt ?? record.createdAt ?? now,
      };
      delete migratedRecord.tags;
      delete migratedRecord.categoryId;

      recordCursor.update(migratedRecord);
      recordCursor.continue();
    };
  };
}

/** @type {IDBDatabase|null} */
let db = null;

/** @returns {Promise<IDBDatabase>} */
function initDB() {
  // If we have a cached connection, validate it has all required stores.
  // A stale v1 connection (e.g. from a module hot-reload) would be missing AUDIT_LOG.
  if (db) {
    if (db.version === DB_VERSION) return Promise.resolve(db);
    // Stale connection at an older version — close and re-open so onupgradeneeded fires.
    db.close();
    db = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORES.CATEGORIES)) {
        database.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORES.RECORDS)) {
        const recordStore = database.createObjectStore(STORES.RECORDS, { keyPath: 'id' });
        recordStore.createIndex('month', 'month', { unique: false });
        recordStore.createIndex('recordType', 'recordType', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.TAGS)) {
        const tagStore = database.createObjectStore(STORES.TAGS, { keyPath: 'id' });
        tagStore.createIndex('normalizedName', 'normalizedName', { unique: true });
      }
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORES.COMMON_RECORD_NAMES)) {
        database.createObjectStore(STORES.COMMON_RECORD_NAMES, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORES.AUDIT_LOG)) {
        const auditStore = database.createObjectStore(STORES.AUDIT_LOG, { keyPath: 'id' });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        auditStore.createIndex('entityType', 'entityType', { unique: false });
        auditStore.createIndex('action', 'action', { unique: false });
      }
      // v3: add isRecurring index on records store
      // v4: add installmentGroupId index on records store
      if (database.objectStoreNames.contains(STORES.RECORDS)) {
        const tx = event.target.transaction;
        const recStore = tx.objectStore(STORES.RECORDS);
        if (recStore.indexNames.contains('categoryId')) {
          recStore.deleteIndex('categoryId');
        }
        if (!recStore.indexNames.contains('recordType')) {
          recStore.createIndex('recordType', 'recordType', { unique: false });
        }
        if (!recStore.indexNames.contains('isRecurring')) {
          recStore.createIndex('isRecurring', 'isRecurring', { unique: false });
        }
        if (!recStore.indexNames.contains('installmentGroupId')) {
          recStore.createIndex('installmentGroupId', 'installmentGroupId', { unique: false });
        }
        if (!recStore.indexNames.contains('fitId')) {
          recStore.createIndex('fitId', 'fitId', { unique: false });
        }
      }

      // v5: backfill updatedAt = createdAt for entities that predate this field
      if (event.oldVersion < 5) {
        const upgradeTx = event.target.transaction;
        const now = new Date().toISOString();
        [STORES.RECORDS, STORES.CATEGORIES, STORES.COMMON_RECORD_NAMES].forEach((storeName) => {
          const store = upgradeTx.objectStore(storeName);
          store.openCursor().onsuccess = function handleCursor(e) {
            const cursor = e.target.result;
            if (!cursor) return;
            if (!cursor.value.updatedAt) {
              cursor.update({ ...cursor.value, updatedAt: cursor.value.createdAt ?? now });
            }
            cursor.continue();
          };
        });
      }

      if (event.oldVersion < 6) {
        migrateLegacyTagsAndRecords(event.target.transaction);
      }
    };

    request.onblocked = () => {
      console.warn(
        '[DB] Upgrade blocked: another tab has the database open at an older version. ' +
        'Please close other DinDin tabs and reload this page.',
      );
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      // Allow upgrades triggered by other tabs to proceed cleanly.
      db.onversionchange = () => {
        db.close();
        db = null;
      };
      resolve(db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @returns {IDBObjectStore}
 */
function getStore(storeName, mode = 'readonly') {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

/**
 * Wrap an IDBRequest in a Promise.
 * @template T
 * @param {IDBRequest} request
 * @returns {Promise<T>}
 */
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export { initDB, getStore, promisify, STORES };
