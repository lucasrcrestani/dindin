/**
 * Unit tests for importDataFromObject().
 * The IndexedDB store is fully mocked so these tests run in Node.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory IDB store mock ───────────────────────────────────────────────────
function makeStore() {
  const data = new Map();
  return {
    _data: data,
    clear: vi.fn(() => { data.clear(); return fakeRequest(undefined); }),
    put:   vi.fn((item) => { data.set(item.id ?? item.key, item); return fakeRequest(item); }),
    get:   vi.fn((key) => fakeRequest(data.get(key))),
    getAll: vi.fn(() => fakeRequest([...data.values()])),
    delete: vi.fn((key) => { data.delete(key); return fakeRequest(undefined); }),
  };
}

function fakeRequest(result) {
  // promisify() attaches .onsuccess; simulate synchronous resolution
  const req = { result };
  setTimeout(() => req.onsuccess?.(), 0);
  return req;
}

const stores = {
  categories: makeStore(),
  records: makeStore(),
  tags: makeStore(),
  settings: makeStore(),
  commonRecordNames: makeStore(),
  auditLog: makeStore(),
};

vi.mock('../src/services/db.js', () => ({
  STORES: {
    CATEGORIES:          'categories',
    RECORDS:             'records',
    TAGS:                'tags',
    SETTINGS:            'settings',
    COMMON_RECORD_NAMES: 'commonRecordNames',
    AUDIT_LOG:           'auditLog',
  },
  getStore: vi.fn((storeName) => stores[storeName]),
  promisify: vi.fn((req) => new Promise((resolve) => {
    if (req.result !== undefined || req.onsuccess) {
      // Already resolved synchronously
      resolve(req.result);
    } else {
      req.onsuccess = () => resolve(req.result);
    }
  })),
  initDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/services/settingsService.js', () => ({
  getSettings: vi.fn().mockResolvedValue({ id: 'main', period: 'monthly', currentMonth: '2025-06' }),
  saveSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/services/categoryService.js', () => ({
  getAllRawCategories: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/recordService.js', () => ({
  getAllRawRecords: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/tagService.js', () => ({
  normalizeTagName: vi.fn((name) => String(name ?? '').trim().toLowerCase()),
  uniqueTagIds: vi.fn((tagIds = []) => [...new Set(tagIds.filter(Boolean))]),
}));

import { importDataFromObject } from '../src/services/importExportService.js';
import { getStore, promisify } from '../src/services/db.js';
import { saveSettings } from '../src/services/settingsService.js';

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(stores).forEach((s) => {
    s._data.clear();
    vi.clearAllMocks();
    // Re-wire fns after clearAllMocks
    s.clear.mockImplementation(() => { s._data.clear(); return fakeRequest(undefined); });
    s.put.mockImplementation((item) => { s._data.set(item.id ?? item.key, item); return fakeRequest(item); });
    s.get.mockImplementation((k) => fakeRequest(s._data.get(k)));
    s.getAll.mockImplementation(() => fakeRequest([...s._data.values()]));
  });
  // Re-wire promisify after clearAllMocks
  promisify.mockImplementation((req) => new Promise((resolve) => {
    if (req && (req.result !== undefined || req.result === undefined)) {
      // Just resolve with result
      resolve(req.result);
    }
  }));
  getStore.mockImplementation((storeName) => stores[storeName]);
});

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('importDataFromObject', () => {
  it('clears all data stores before inserting new data', async () => {
    await importDataFromObject({ categories: [], records: [], commonRecordNames: [] });

    expect(stores.categories.clear).toHaveBeenCalled();
    expect(stores.records.clear).toHaveBeenCalled();
    expect(stores.tags.clear).toHaveBeenCalled();
    expect(stores.commonRecordNames.clear).toHaveBeenCalled();
    expect(stores.settings.clear).toHaveBeenCalled();
  });

  it('does NOT clear the audit log', async () => {
    await importDataFromObject({ categories: [], records: [], commonRecordNames: [] });
    expect(stores.auditLog.clear).not.toHaveBeenCalled();
  });

  it('inserts all provided categories', async () => {
    const cats = [
      { id: 'c1', name: 'Food', tagIds: ['t1'], updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'c2', name: 'Transport', tagIds: ['t2'], updatedAt: '2025-01-02T00:00:00.000Z' },
    ];
    await importDataFromObject({ categories: cats, records: [], commonRecordNames: [] });
    expect(stores.categories.put).toHaveBeenCalledTimes(2);
  });

  it('inserts all provided records', async () => {
    const recs = [
      { id: 'r1', name: 'Lunch', recordType: 'expense', tagIds: ['t1'], updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'r2', name: 'Bus', recordType: 'expense', tagIds: ['t2'], updatedAt: '2025-01-02T00:00:00.000Z' },
      { id: 'r3', name: 'Rent', recordType: 'expense', tagIds: ['t3'], updatedAt: '2025-01-03T00:00:00.000Z' },
    ];
    await importDataFromObject({ categories: [], records: recs, commonRecordNames: [] });
    expect(stores.records.put).toHaveBeenCalledTimes(3);
  });

  it('inserts all provided tags', async () => {
    const tags = [{ id: 't1', name: 'Essencial', normalizedName: 'essencial' }];
    await importDataFromObject({ categories: [], records: [], tags, commonRecordNames: [] });
    expect(stores.tags.put).toHaveBeenCalledTimes(1);
  });

  it('inserts all provided commonRecordNames', async () => {
    const names = [{ id: 'n1', name: 'Lunch' }];
    await importDataFromObject({ categories: [], records: [], commonRecordNames: names });
    expect(stores.commonRecordNames.put).toHaveBeenCalledTimes(1);
  });

  it('calls saveSettings when settings are provided', async () => {
    const settings = { period: 'monthly', currentMonth: '2025-06' };
    await importDataFromObject({ categories: [], records: [], commonRecordNames: [], settings });
    expect(saveSettings).toHaveBeenCalled();
  });

  it('does not call saveSettings when settings are omitted', async () => {
    await importDataFromObject({ categories: [], records: [], commonRecordNames: [] });
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('handles completely empty payload without throwing', async () => {
    await expect(importDataFromObject({})).resolves.toBeUndefined();
  });

  it('normalizes legacy payloads with inline tags and categoryId', async () => {
    await importDataFromObject({
      categories: [{ id: 'c1', name: 'Food', recordType: 'expense', tags: ['Essencial'] }],
      records: [{ id: 'r1', name: 'Lunch', value: '10', date: '2025-01-01', categoryId: 'c1', tags: ['Mercado'] }],
    });

    const savedCategory = stores.categories.put.mock.calls[0][0];
    const savedRecord = stores.records.put.mock.calls[0][0];
    expect(savedCategory.tagIds.length).toBeGreaterThan(0);
    expect(savedRecord.tagIds.length).toBeGreaterThan(0);
    expect(savedRecord.recordType).toBe('expense');
    expect(savedRecord.categoryId).toBeUndefined();
  });
});
