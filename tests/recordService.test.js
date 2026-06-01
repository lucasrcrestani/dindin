/**
 * Unit tests for record creation logic.
 * Tests createRecord() as a pure factory and saveRecord() via a mocked DB.
 * Dependencies mocked: ../src/services/db.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted before imports) ─────────────────────────────────────
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

import { createRecord } from '../src/models/Record.js';
import { saveRecord } from '../src/services/recordService.js';
import { getStore, promisify } from '../src/services/db.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const BASE_DATA = {
  categoryId: 'cat-1',
  value: '100',
  name: 'Mercado',
  date: '2026-05-15',
  isRecurring: false,
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

// ── createRecord() ─────────────────────────────────────────────────────────────
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

  it('defaults isRecurring, isInstallment to false when omitted', () => {
    const { categoryId, value, name, date } = BASE_DATA;
    const record = createRecord({ categoryId, value, name, date });
    expect(record.isRecurring).toBe(false);
    expect(record.isInstallment).toBe(false);
  });

  it('falls back to today when date is not provided', () => {
    const today = new Date().toISOString().slice(0, 10);
    const record = createRecord({ categoryId: 'c', value: '10', name: 'X' });
    expect(record.date).toBe(today);
    expect(record.month).toBe(today.slice(0, 7));
  });

  it('defaults tags to an empty array when not provided', () => {
    const record = createRecord({ ...BASE_DATA });
    expect(record.tags).toEqual([]);
  });

  it('stores provided tags on the record', () => {
    const record = createRecord({ ...BASE_DATA, tags: ['alimentação', 'mercado'] });
    expect(record.tags).toEqual(['alimentação', 'mercado']);
  });
});

// ── saveRecord() ───────────────────────────────────────────────────────────────
describe('saveRecord()', () => {
  it('creates a new record with a generated id when no id is provided', async () => {
    const record = await saveRecord({ ...BASE_DATA });
    expect(record.id).toBeTruthy();
    expect(record.categoryId).toBe('cat-1');
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
      categoryId: 'cat-1',
      value: '100',
      name: 'Mercado',
      date: '2026-05-15',
      month: '2026-05',
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
    expect(saved.categoryId).toBe('cat-1');
  });

  it('persists tags when saving a new record', async () => {
    const fakeStore = getStore();
    await saveRecord({ ...BASE_DATA, tags: ['viagem'] });
    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.tags).toEqual(['viagem']);
  });

  it('persists tags when updating an existing record', async () => {
    const fakeStore = getStore();
    const existing = {
      id: 'existing-id',
      categoryId: 'cat-1',
      value: '100',
      name: 'Mercado',
      date: '2026-05-15',
      month: '2026-05',
      tags: ['old-tag'],
      isRecurring: false,
      registeredInCurrentMonth: false,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await saveRecord({ ...existing, tags: ['novo-tag'] });
    const saved = fakeStore.put.mock.calls[0][0];
    expect(saved.tags).toEqual(['novo-tag']);
    expect(saved.id).toBe('existing-id');
  });
});
