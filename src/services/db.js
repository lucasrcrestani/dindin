const DB_NAME = 'dindin';
const DB_VERSION = 1;

const STORES = {
  CATEGORIES: 'categories',
  RECORDS: 'records',
  SETTINGS: 'settings',
  COMMON_RECORD_NAMES: 'commonRecordNames',
};

/** @type {IDBDatabase|null} */
let db = null;

/** @returns {Promise<IDBDatabase>} */
function initDB() {
  if (db) return Promise.resolve(db);

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
    };

    request.onsuccess = (event) => {
      db = event.target.result;
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
