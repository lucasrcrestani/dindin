import { describe, it, expect } from 'vitest';
import { validateRowData } from '../src/components/bulkAddPage.js';

const VALID_DATA = {
  recordType: 'expense',
  name: 'Mercado',
  date: '2026-05-15',
  rawValue: '100',
  isInstallment: false,
  installmentCount: NaN,
  tags: ['essencial'],
};

describe('validateRowData() — valid input', () => {
  it('returns no errors for a fully valid simple record', () => {
    expect(validateRowData(VALID_DATA)).toEqual({});
  });

  it('returns no errors for a valid installment record with count >= 2', () => {
    expect(validateRowData({ ...VALID_DATA, isInstallment: true, installmentCount: 3 })).toEqual({});
  });

  it('accepts formula values like 50+7', () => {
    expect(validateRowData({ ...VALID_DATA, rawValue: '50+7' })).toEqual({});
  });
});

describe('validateRowData() — required fields', () => {
  it('returns recordType error when type is missing', () => {
    const errors = validateRowData({ ...VALID_DATA, recordType: '' });
    expect(errors.recordType).toBeDefined();
  });

  it('returns name error when name is empty', () => {
    const errors = validateRowData({ ...VALID_DATA, name: '   ' });
    expect(errors.name).toBeDefined();
  });

  it('returns date error when date is empty', () => {
    const errors = validateRowData({ ...VALID_DATA, date: '' });
    expect(errors.date).toBeDefined();
  });

  it('returns tags error when there are no tags', () => {
    const errors = validateRowData({ ...VALID_DATA, tags: [] });
    expect(errors.tags).toBeDefined();
  });
});

describe('validateRowData() — invalid value', () => {
  it('returns value error for invalid formulas', () => {
    const errors = validateRowData({ ...VALID_DATA, rawValue: '10+' });
    expect(errors.value).toBeDefined();
  });
});

describe('validateRowData() — installment count', () => {
  it('returns installmentCount error when count is below 2', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: true, installmentCount: 1 });
    expect(errors.installmentCount).toBeDefined();
  });

  it('does not return installmentCount error when row is not installment', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: false, installmentCount: 0 });
    expect(errors.installmentCount).toBeUndefined();
  });
});
