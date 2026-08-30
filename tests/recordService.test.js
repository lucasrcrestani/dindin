import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/db.js', () => {
  const fakeRequest = (result) => ({ result });

  const fakeStore = {
    put: vi.fn().mockImplementation((record) => fakeRequest(record)),
  };

  return {
    STORES: { RECORDS: 'records' },
    getStore: vi.fn().mockReturnValue(fakeStore),
    promisify: vi.fn().mockImplementation((req) => Promise.resolve(req.result)),
  };
});

vi.mock('../src/services/tagService.js', () => ({
  resolveInputTagIds: vi.fn(async (data) => data.tagIds ?? ['tag-1']),
  hydrateEntityTags: vi.fn(async (entity) => ({ ...entity, tags: entity.tagIds ?? [] })),
  hydrateEntityTagsList: vi.fn(async (entities) => entities),
  ensureTagIds: vi.fn(async (tags) => tags ?? []),
}));

vi.mock('../src/services/categoryService.js', () => ({
  getRawCategoryById: vi.fn(),
}));

import { createRecord } from '../src/models/Record.js';
import { saveRecord, updateRecurringFromCurrent } from '../src/services/recordService.js';
import { getStore, promisify } from '../src/services/db.js';

// node environment has no IDBKeyRange; provide a minimal stub
globalThis.IDBKeyRange = { only: (v) => v };

const BASE_DATA = {
  recordType: 'expense',
  value: '100',
  name: 'Mercado',
  date: '2026-05-15',
  isRecurring: false,
  tagIds: ['tag-1'],
};

beforeEach(() => {
  vi.clearAllMocks();

  // Re-apply mock implementations after clearAllMocks (clearAllMocks resets call counts
  // but does not reset mockImplementation for vi.mock factory — so this is only needed
  // if implementations were changed mid-test).
  const fakeRequest = (result) => ({ result });
  getStore.mockReturnValue({
    put: vi.fn().mockImplementation((record) => fakeRequest(record)),
  });
  promisify.mockImplementation((req) => Promise.resolve(req.result));
});

describe('createRecord()', () => {
  it('derives month from date by default', () => {
    const record = createRecord({ ...BASE_DATA });
    expect(record.month).toBe('2026-05');
  });

  it('uses explicit month override when provided', () => {
    const record = createRecord({ ...BASE_DATA, month: '2026-04' });
    expect(record.month).toBe('2026-04');
    expect(record.date).toBe('2026-05-15'); // date is unchanged
  });

  it('sets registeredInCurrentMonth to false by default', () => {
    const record = createRecord({ ...BASE_DATA });
    expect(record.registeredInCurrentMonth).toBe(false);
  });

  it('sets registeredInCurrentMonth to true when passed', () => {
    const record = createRecord({ ...BASE_DATA, registeredInCurrentMonth: true });
    expect(record.registeredInCurrentMonth).toBe(true);
  });

  it('sets registeredInCurrentMonth=true and month override together', () => {
    const record = createRecord({ ...BASE_DATA, month: '2026-04', registeredInCurrentMonth: true });
    expect(record.month).toBe('2026-04');
    expect(record.registeredInCurrentMonth).toBe(true);
    expect(record.date).toBe('2026-05-15');
  });

  it('sets createdAt and updatedAt to the same ISO string on creation', () => {
    const record = createRecord({ ...BASE_DATA });
    expect(record.createdAt).toBeTruthy();
    expect(record.updatedAt).toBe(record.createdAt);
  });

  it('generates a non-empty string id', () => {
    const record = createRecord({ ...BASE_DATA });
    expect(typeof record.id).toBe('string');
    expect(record.id.length).toBeGreaterThan(0);
  });

  it('generates unique ids for successive calls', () => {
    const a = createRecord({ ...BASE_DATA });
    const b = createRecord({ ...BASE_DATA });
    expect(a.id).not.toBe(b.id);
  });

  it('falls back to today when date is not provided', () => {
    const today = new Date().toISOString().slice(0, 10);
    const record = createRecord({ recordType: 'income', value: '10', name: 'X' });
    expect(record.date).toBe(today);
    expect(record.month).toBe(today.slice(0, 7));
  });

  it('defaults tagIds to an empty array when not provided', () => {
    const record = createRecord({ recordType: 'income', value: '10', name: 'X' });
    expect(record.tagIds).toEqual([]);
  });

  it('stores provided tagIds on the record', () => {
    const record = createRecord({ ...BASE_DATA, tagIds: ['tag-a', 'tag-b'] });
    expect(record.tagIds).toEqual(['tag-a', 'tag-b']);
  });
});

describe('saveRecord()', () => {
  it('creates a new record with a generated id when no id is provided', async () => {
    const record = await saveRecord({ ...BASE_DATA });
    expect(record.id).toBeTruthy();
    expect(record.recordType).toBe('expense');
    expect(record.month).toBe('2026-05');
  });

  it('preserves registeredInCurrentMonth and month override for new records', async () => {
    const record = await saveRecord({ ...BASE_DATA, month: '2026-04', registeredInCurrentMonth: true });
    expect(record.month).toBe('2026-04');
    expect(record.registeredInCurrentMonth).toBe(true);
  });

  it('updates updatedAt but keeps createdAt when editing an existing record', async () => {
    const original = {
      id: 'existing-id',
      recordType: 'expense',
      value: '100',
      name: 'Mercado',
      date: '2026-05-15',
      month: '2026-05',
      tagIds: ['tag-1'],
      isRecurring: false,
      registeredInCurrentMonth: false,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    const before = Date.now();
    const updated = await saveRecord({ ...original, name: 'Mercado Extra' });
    const after = Date.now();

    expect(updated.id).toBe('existing-id');
    expect(updated.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(updated.name).toBe('Mercado Extra');

    const updatedAt = new Date(updated.updatedAt).getTime();
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(after);
  });

  it('persists the record to the DB store via put', async () => {
    const fakeStore = getStore();
    await saveRecord({ ...BASE_DATA });
    expect(fakeStore.put).toHaveBeenCalledOnce();
    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.recordType).toBe('expense');
  });

  it('persists tagIds when saving a new record', async () => {
    const fakeStore = getStore();
    await saveRecord({ ...BASE_DATA, tags: ['tag-2'] });
    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.tagIds).toEqual(['tag-2']);
  });
});

describe('updateRecurringFromCurrent()', () => {
  const makeRecurring = (overrides = {}) => ({
    id: overrides.id ?? 'rec-1',
    recordType: overrides.recordType ?? 'expense',
    name: overrides.name ?? 'Mercado',
    value: overrides.value ?? '100',
    month: overrides.month ?? '2026-06',
    date: `${overrides.month ?? '2026-06'}-01`,
    isRecurring: true,
    tagIds: overrides.tagIds ?? ['tag-a'],
    recurringGroupId: overrides.recurringGroupId ?? null,
    ...overrides,
  });

  function setupMock({ months = [], recordsByMonth = {} } = {}) {
    const fakeStore = {
      put: vi.fn().mockImplementation((record) => ({ result: record })),
      index: vi.fn().mockImplementation(() => ({
        // cursor request is created lazily on call to avoid orphaned microtasks
        openKeyCursor: vi.fn().mockImplementation(() => {
          const req = {};
          queueMicrotask(() => {
            let i = 0;
            const step = () => {
              if (i < months.length) {
                req.onsuccess?.({ target: { result: { key: months[i++], continue: step } } });
              } else {
                req.onsuccess?.({ target: { result: null } });
              }
            };
            step();
          });
          return req;
        }),
        getAll: vi.fn().mockImplementation((key) => ({ result: recordsByMonth[key] ?? [] })),
      })),
    };
    getStore.mockReturnValue(fakeStore);
    promisify.mockImplementation((req) => Promise.resolve(req.result));
    return fakeStore;
  }

  it('does nothing when the record is not recurring', async () => {
    const fakeStore = setupMock({ months: ['2026-06'] });
    await updateRecurringFromCurrent({ ...BASE_DATA, isRecurring: false, recurringGroupId: 'g1' }, '2026-05');
    expect(fakeStore.put).not.toHaveBeenCalled();
  });

  it('updates future records matching by recurringGroupId', async () => {
    const future = makeRecurring({ id: 'f-1', month: '2026-06', recurringGroupId: 'grp-1' });
    const fakeStore = setupMock({
      months: ['2026-05', '2026-06'],
      recordsByMonth: { '2026-06': [future] },
    });

    const edited = makeRecurring({ id: 'cur-1', month: '2026-05', recurringGroupId: 'grp-1', name: 'Mercado Extra', value: '150', tagIds: ['tag-b'] });
    await updateRecurringFromCurrent(edited, '2026-05');

    expect(fakeStore.put).toHaveBeenCalledOnce();
    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.id).toBe('f-1');
    expect(saved.name).toBe('Mercado Extra');
    expect(saved.value).toBe('150');
    expect(saved.recurringGroupId).toBe('grp-1');
  });

  it('does not touch records in current or past months', async () => {
    const past = makeRecurring({ id: 'p-1', month: '2026-04', recurringGroupId: 'grp-1' });
    const current = makeRecurring({ id: 'c-1', month: '2026-05', recurringGroupId: 'grp-1' });
    const fakeStore = setupMock({
      months: ['2026-04', '2026-05'],
      recordsByMonth: { '2026-04': [past], '2026-05': [current] },
    });

    const edited = makeRecurring({ id: 'cur-1', month: '2026-05', recurringGroupId: 'grp-1' });
    await updateRecurringFromCurrent(edited, '2026-05');

    expect(fakeStore.put).not.toHaveBeenCalled();
  });

  it('falls back to name+recordType matching when recurringGroupId is null', async () => {
    const future = makeRecurring({ id: 'f-2', month: '2026-06', recurringGroupId: null, name: 'Mercado', recordType: 'expense' });
    const fakeStore = setupMock({
      months: ['2026-06'],
      recordsByMonth: { '2026-06': [future] },
    });

    const edited = makeRecurring({ id: 'cur-2', month: '2026-05', recurringGroupId: null, name: 'Mercado', value: '200' });
    await updateRecurringFromCurrent(edited, '2026-05');

    expect(fakeStore.put).toHaveBeenCalledOnce();
    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.value).toBe('200');
  });

  it('does not match a future record with a different name when recurringGroupId is null', async () => {
    const future = makeRecurring({ id: 'f-3', month: '2026-06', recurringGroupId: null, name: 'Academia' });
    const fakeStore = setupMock({
      months: ['2026-06'],
      recordsByMonth: { '2026-06': [future] },
    });

    const edited = makeRecurring({ id: 'cur-3', month: '2026-05', recurringGroupId: null, name: 'Mercado' });
    await updateRecurringFromCurrent(edited, '2026-05');

    expect(fakeStore.put).not.toHaveBeenCalled();
  });

  it('assigns recurringGroupId to legacy future records on propagation', async () => {
    const future = makeRecurring({ id: 'f-4', month: '2026-06', recurringGroupId: null });
    const fakeStore = setupMock({
      months: ['2026-06'],
      recordsByMonth: { '2026-06': [future] },
    });

    const edited = makeRecurring({ id: 'cur-4', month: '2026-05', recurringGroupId: 'new-grp' });
    await updateRecurringFromCurrent(edited, '2026-05');

    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.recurringGroupId).toBe('new-grp');
  });

  it('propagates changes across multiple future months', async () => {
    const f1 = makeRecurring({ id: 'f-5a', month: '2026-06', recurringGroupId: 'grp-2' });
    const f2 = makeRecurring({ id: 'f-5b', month: '2026-07', recurringGroupId: 'grp-2' });
    const fakeStore = setupMock({
      months: ['2026-06', '2026-07'],
      recordsByMonth: { '2026-06': [f1], '2026-07': [f2] },
    });

    const edited = makeRecurring({ id: 'cur-5', month: '2026-05', recurringGroupId: 'grp-2', name: 'Novo Nome' });
    await updateRecurringFromCurrent(edited, '2026-05');

    expect(fakeStore.put).toHaveBeenCalledTimes(2);
    fakeStore.put.mock.calls.forEach(([saved]) => expect(saved.name).toBe('Novo Nome'));
  });
});
