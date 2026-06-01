/**
 * Shared helpers for E2E tests.
 * All functions work with a Playwright `page` object.
 */

/**
 * Attaches console, pageerror and requestfailed listeners to the page.
 * Returns the collected logs array (mutated as events arrive).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {{ type: string, text: string, source?: string }[]}
 */
function collectLogs(page) {
  const logs = [];

  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: err.message, source: err.stack });
  });

  page.on('requestfailed', (req) => {
    // Ignore the Google API scripts that are expected to fail in test env
    const url = req.url();
    if (url.includes('googleapis.com') || url.includes('accounts.google.com')) return;
    logs.push({ type: 'requestfailed', text: `${req.method()} ${url} — ${req.failure()?.errorText ?? 'unknown'}` });
  });

  return logs;
}

/**
 * Throws if any collected log is a pageerror or console.error.
 *
 * @param {{ type: string, text: string }[]} logs
 */
function assertNoErrors(logs) {
  const errors = logs.filter((l) => l.type === 'pageerror' || l.type === 'error');
  if (errors.length > 0) {
    const messages = errors.map((e) => `[${e.type}] ${e.text}`).join('\n');
    throw new Error(`Unexpected JS errors detected:\n${messages}`);
  }
}

/**
 * Returns true if the collected logs contain a console.log whose text
 * includes the given substring.
 *
 * @param {{ type: string, text: string }[]} logs
 * @param {string} substring
 * @returns {boolean}
 */
function hasLog(logs, substring) {
  // 'startGroup' covers console.group() calls which also carry meaningful text
  return logs.some((l) => (l.type === 'log' || l.type === 'startGroup') && l.text.includes(substring));
}

/**
 * Waits until the app has bootstrapped (app-main is non-empty).
 * Fails with a descriptive error if the app shows an error state.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForBootstrap(page) {
  await page.waitForSelector('#app-main:not(:empty)', { timeout: 10000 });
}

/**
 * Clears the IndexedDB database used by the app and reloads the page,
 * giving each test a completely fresh state.
 *
 * @param {import('@playwright/test').Page} page
 */
async function clearAppData(page) {
  await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('dindin');
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      req.onblocked = resolve; // proceed even if blocked
    });
  });
  await page.reload();
}

/**
 * Injects a data payload directly into IndexedDB, bypassing the UI.
 * Useful for seeding the database before a test scenario.
 *
 * Navigates to a script-free seed page first (same origin, no IndexedDB
 * competition from app.js), seeds the data, then navigates to the app.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ categories?: object[], records?: object[], settings?: object, commonRecordNames?: object[] }} payload
 */
async function seedDatabase(page, payload) {
  // Navigate to the script-free helper page so IndexedDB is accessible at the
  // correct origin but the app has NOT yet opened a competing connection.
  await page.goto('/seed.html');

  await page.evaluate(async (data) => {
    const DB_NAME = 'dindin';
    const DB_VERSION = 5;

    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      req.onblocked = resolve;
    });

    await new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Mirror the exact schema from src/services/db.js so the app finds
        // all expected indexes and doesn't throw on first use.
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const recStore = db.createObjectStore('records', { keyPath: 'id' });
          recStore.createIndex('month', 'month', { unique: false });
          recStore.createIndex('categoryId', 'categoryId', { unique: false });
          recStore.createIndex('isRecurring', 'isRecurring', { unique: false });
          recStore.createIndex('installmentGroupId', 'installmentGroupId', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('commonRecordNames')) {
          db.createObjectStore('commonRecordNames', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('auditLog')) {
          const auditStore = db.createObjectStore('auditLog', { keyPath: 'id' });
          auditStore.createIndex('timestamp', 'timestamp', { unique: false });
          auditStore.createIndex('entityType', 'entityType', { unique: false });
          auditStore.createIndex('action', 'action', { unique: false });
        }
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = async (e) => {
        const db = e.target.result;
        const puts = [];

        const putAll = (storeName, items = []) => {
          if (!items.length) return;
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const item of items) store.put(item);
          puts.push(new Promise((res, rej) => {
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
          }));
        };

        putAll('categories', data.categories);
        putAll('records', data.records);
        putAll('commonRecordNames', data.commonRecordNames);

        if (data.settings) {
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ id: 'main', ...data.settings });
          puts.push(new Promise((res, rej) => {
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
          }));
        }

        await Promise.all(puts);
        db.close();
        resolve();
      };
    });
  }, payload);

  // Navigate to the app — seed.html is script-free so reload() would just reload
  // seed.html (useless). We need to go to the app root to trigger bootstrap.
  await page.goto('/');
}

export { collectLogs, assertNoErrors, hasLog, waitForBootstrap, clearAppData, seedDatabase };
