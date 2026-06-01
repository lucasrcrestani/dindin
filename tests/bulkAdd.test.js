/**
 * Unit tests for validateRowData() and filterCategories() from bulkAddPage.js.
 * These are pure functions with no DOM or DB dependencies.
 */
import { describe, it, expect } from 'vitest';
import { validateRowData, filterCategories } from '../src/components/bulkAddPage.js';

const VALID_DATA = {
  categoryId: 'cat-1',
  name: 'Mercado',
  date: '2026-05-15',
  rawValue: '100',
  isInstallment: false,
  installmentCount: NaN,
};

// ── Happy path ────────────────────────────────────────────────────────────────
describe('validateRowData() — valid input', () => {
  it('returns no errors for a fully valid simple record', () => {
    const errors = validateRowData(VALID_DATA);
    expect(errors).toEqual({});
  });

  it('returns no errors for a valid recurring record', () => {
    const errors = validateRowData({ ...VALID_DATA, isRecurring: true });
    expect(errors).toEqual({});
  });

  it('returns no errors for a valid installment record with count >= 2', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: true, installmentCount: 3 });
    expect(errors).toEqual({});
  });

  it('accepts formula values like "50+7"', () => {
    const errors = validateRowData({ ...VALID_DATA, rawValue: '50+7' });
    expect(errors).toEqual({});
  });

  it('accepts comma as decimal separator "1,50"', () => {
    const errors = validateRowData({ ...VALID_DATA, rawValue: '1,50' });
    expect(errors).toEqual({});
  });
});

// ── Missing category ──────────────────────────────────────────────────────────
describe('validateRowData() — missing category', () => {
  it('returns categoryId error when categoryId is empty string', () => {
    const errors = validateRowData({ ...VALID_DATA, categoryId: '' });
    expect(errors.categoryId).toBeDefined();
  });

  it('returns categoryId error when categoryId is null', () => {
    const errors = validateRowData({ ...VALID_DATA, categoryId: null });
    expect(errors.categoryId).toBeDefined();
  });
});

// ── Missing name ──────────────────────────────────────────────────────────────
describe('validateRowData() — missing name', () => {
  it('returns name error when name is empty', () => {
    const errors = validateRowData({ ...VALID_DATA, name: '' });
    expect(errors.name).toBeDefined();
  });

  it('returns name error when name is whitespace only', () => {
    const errors = validateRowData({ ...VALID_DATA, name: '   ' });
    expect(errors.name).toBeDefined();
  });
});

// ── Missing date ──────────────────────────────────────────────────────────────
describe('validateRowData() — missing date', () => {
  it('returns date error when date is empty', () => {
    const errors = validateRowData({ ...VALID_DATA, date: '' });
    expect(errors.date).toBeDefined();
  });
});

// ── Invalid value formula ─────────────────────────────────────────────────────
describe('validateRowData() — invalid value', () => {
  it('returns value error when rawValue is empty', () => {
    const errors = validateRowData({ ...VALID_DATA, rawValue: '' });
    expect(errors.value).toBeDefined();
  });

  it('returns value error for non-numeric text', () => {
    const errors = validateRowData({ ...VALID_DATA, rawValue: 'abc' });
    expect(errors.value).toBeDefined();
  });

  it('returns value error for incomplete expression like "10+"', () => {
    const errors = validateRowData({ ...VALID_DATA, rawValue: '10+' });
    expect(errors.value).toBeDefined();
  });
});

// ── Installment count ─────────────────────────────────────────────────────────
describe('validateRowData() — installment count', () => {
  it('returns installmentCount error when count is 1', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: true, installmentCount: 1 });
    expect(errors.installmentCount).toBeDefined();
  });

  it('returns installmentCount error when count is NaN', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: true, installmentCount: NaN });
    expect(errors.installmentCount).toBeDefined();
  });

  it('does NOT return installmentCount error when isInstallment is false, even with bad count', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: false, installmentCount: 0 });
    expect(errors.installmentCount).toBeUndefined();
  });

  it('returns installmentCount error for minimum boundary (count = 2 is valid)', () => {
    const errors = validateRowData({ ...VALID_DATA, isInstallment: true, installmentCount: 2 });
    expect(errors.installmentCount).toBeUndefined();
  });
});

// ── Multiple errors at once ───────────────────────────────────────────────────
describe('validateRowData() — multiple errors', () => {
  it('collects all errors simultaneously', () => {
    const errors = validateRowData({
      categoryId: '',
      name: '',
      date: '',
      rawValue: '',
      isInstallment: false,
      installmentCount: NaN,
    });
    expect(errors.categoryId).toBeDefined();
    expect(errors.name).toBeDefined();
    expect(errors.date).toBeDefined();
    expect(errors.value).toBeDefined();
  });
});

// ── filterCategories ──────────────────────────────────────────────────────────
const CAT_ALIMENTACAO = { id: '1', name: 'Alimentação', recordType: 'expense' };
const CAT_TRANSPORTE  = { id: '2', name: 'Transporte',  recordType: 'expense' };
const CAT_SALARIO     = { id: '3', name: 'Salário',     recordType: 'income'  };
const ALL_CATS = [CAT_ALIMENTACAO, CAT_TRANSPORTE, CAT_SALARIO];

describe('filterCategories() — empty query', () => {
  it('returns all categories split by type when query is empty', () => {
    const { expenses, incomes } = filterCategories(ALL_CATS, '');
    expect(expenses).toEqual([CAT_ALIMENTACAO, CAT_TRANSPORTE]);
    expect(incomes).toEqual([CAT_SALARIO]);
  });

  it('returns all categories split by type when query is whitespace only', () => {
    const { expenses, incomes } = filterCategories(ALL_CATS, '   ');
    expect(expenses).toEqual([CAT_ALIMENTACAO, CAT_TRANSPORTE]);
    expect(incomes).toEqual([CAT_SALARIO]);
  });
});

describe('filterCategories() — with query', () => {
  it('filters to matching expense categories', () => {
    const { expenses, incomes } = filterCategories(ALL_CATS, 'alim');
    expect(expenses).toEqual([CAT_ALIMENTACAO]);
    expect(incomes).toEqual([]);
  });

  it('filters to matching income categories', () => {
    const { expenses, incomes } = filterCategories(ALL_CATS, 'salário');
    expect(expenses).toEqual([]);
    expect(incomes).toEqual([CAT_SALARIO]);
  });

  it('is case-insensitive', () => {
    const { expenses } = filterCategories(ALL_CATS, 'ALIM');
    expect(expenses).toEqual([CAT_ALIMENTACAO]);
  });

  it('matches substring anywhere in the name', () => {
    const { expenses } = filterCategories(ALL_CATS, 'port');
    expect(expenses).toEqual([CAT_TRANSPORTE]);
  });

  it('returns empty arrays when no category matches', () => {
    const { expenses, incomes } = filterCategories(ALL_CATS, 'xyz');
    expect(expenses).toEqual([]);
    expect(incomes).toEqual([]);
  });
});

describe('filterCategories() — edge cases', () => {
  it('handles an empty category list', () => {
    const { expenses, incomes } = filterCategories([], 'alim');
    expect(expenses).toEqual([]);
    expect(incomes).toEqual([]);
  });

  it('handles categories with no expenses', () => {
    const { expenses, incomes } = filterCategories([CAT_SALARIO], '');
    expect(expenses).toEqual([]);
    expect(incomes).toEqual([CAT_SALARIO]);
  });

  it('handles categories with no incomes', () => {
    const { expenses, incomes } = filterCategories([CAT_ALIMENTACAO], '');
    expect(expenses).toEqual([CAT_ALIMENTACAO]);
    expect(incomes).toEqual([]);
  });
});
