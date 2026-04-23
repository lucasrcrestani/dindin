const DB_NAME = 'dindin';
const DB_VERSION = 3;

const STORES = {
  CATEGORIES: 'categories',
  RECORDS: 'records',
  SETTINGS: 'settings',
  COMMON_RECORD_NAMES: 'commonRecordNames',
  AUDIT_LOG: 'auditLog',
};

/** @type {IDBDatabase|null} */
let db = null;

/** @returns {Promise<IDBDatabase>} */
function initDB() {
  // If we have a cached connection, validate it has all required stores.
  // A stale v1 connection (e.g. from a module hot-reload) would be missing AUDIT_LOG.
  if (db) {
    if (db.objectStoreNames.contains(STORES.AUDIT_LOG)) {
      return Promise.resolve(db);
    }
    // Stale connection — close it and fall through to open a fresh one.
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
        recordStore.createIndex('categoryId', 'categoryId', { unique: false });
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
      if (database.objectStoreNames.contains(STORES.RECORDS)) {
        const tx = event.target.transaction;
        const recStore = tx.objectStore(STORES.RECORDS);
        if (!recStore.indexNames.contains('isRecurring')) {
          recStore.createIndex('isRecurring', 'isRecurring', { unique: false });
        }
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
