/**
 * Unit tests for splitRecordsByType() exported from the card components.
 * Both installmentRecordsCard and recurringRecordsCard share the same logic;
 * tested here via the installmentRecordsCard export.
 */
import { describe, it, expect } from 'vitest';
import { splitRecordsByType } from '../src/components/installmentRecordsCard.js';

const EXPENSE_CAT = { id: 'cat-exp', recordType: 'expense', name: 'Moradia' };
const INCOME_CAT = { id: 'cat-inc', recordType: 'income', name: 'Salário' };

const CATEGORY_MAP = new Map([
  [EXPENSE_CAT.id, EXPENSE_CAT],
  [INCOME_CAT.id, INCOME_CAT],
]);

const EXPENSE_RECORD = { id: 'r1', categoryId: 'cat-exp', value: '500', name: 'Aluguel' };
const INCOME_RECORD = { id: 'r2', categoryId: 'cat-inc', value: '3000', name: 'Freelance' };
const UNKNOWN_CAT_RECORD = { id: 'r3', categoryId: 'cat-unknown', value: '100', name: 'Algo' };

describe('splitRecordsByType()', () => {
  it('separates expenses and incomes correctly', () => {
    const { expenses, incomes } = splitRecordsByType([EXPENSE_RECORD, INCOME_RECORD], CATEGORY_MAP);
    expect(expenses).toEqual([EXPENSE_RECORD]);
    expect(incomes).toEqual([INCOME_RECORD]);
  });

  it('returns empty incomes when all records are expenses', () => {
    const { expenses, incomes } = splitRecordsByType([EXPENSE_RECORD], CATEGORY_MAP);
    expect(expenses).toHaveLength(1);
    expect(incomes).toHaveLength(0);
  });

  it('returns empty expenses when all records are incomes', () => {
    const { expenses, incomes } = splitRecordsByType([INCOME_RECORD], CATEGORY_MAP);
    expect(expenses).toHaveLength(0);
    expect(incomes).toHaveLength(1);
  });

  it('returns both empty arrays for empty input', () => {
    const { expenses, incomes } = splitRecordsByType([], CATEGORY_MAP);
    expect(expenses).toHaveLength(0);
    expect(incomes).toHaveLength(0);
  });

  it('treats records with unknown category as income (fallback)', () => {
    const { expenses, incomes } = splitRecordsByType([UNKNOWN_CAT_RECORD], CATEGORY_MAP);
    expect(expenses).toHaveLength(0);
    expect(incomes).toHaveLength(1);
  });

  it('preserves original record order within each group', () => {
    const r1 = { id: 'a', categoryId: 'cat-exp', value: '10', name: 'A' };
    const r2 = { id: 'b', categoryId: 'cat-exp', value: '20', name: 'B' };
    const r3 = { id: 'c', categoryId: 'cat-inc', value: '30', name: 'C' };
    const { expenses, incomes } = splitRecordsByType([r1, r3, r2], CATEGORY_MAP);
    expect(expenses.map((r) => r.id)).toEqual(['a', 'b']);
    expect(incomes.map((r) => r.id)).toEqual(['c']);
  });
});
