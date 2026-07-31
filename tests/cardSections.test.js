import { describe, it, expect } from 'vitest';
import { splitRecordsByType } from '../src/components/installmentRecordsCard.js';

const EXPENSE_RECORD = { id: 'r1', recordType: 'expense', value: '500', name: 'Aluguel' };
const INCOME_RECORD = { id: 'r2', recordType: 'income', value: '3000', name: 'Freelance' };
const UNKNOWN_TYPE_RECORD = { id: 'r3', recordType: null, value: '100', name: 'Algo' };

describe('splitRecordsByType()', () => {
  it('separates expenses and incomes correctly', () => {
    const { expenses, incomes } = splitRecordsByType([EXPENSE_RECORD, INCOME_RECORD]);
    expect(expenses).toEqual([EXPENSE_RECORD]);
    expect(incomes).toEqual([INCOME_RECORD]);
  });

  it('returns both empty arrays for empty input', () => {
    const { expenses, incomes } = splitRecordsByType([]);
    expect(expenses).toEqual([]);
    expect(incomes).toEqual([]);
  });

  it('treats records without expense type as income fallback', () => {
    const { expenses, incomes } = splitRecordsByType([UNKNOWN_TYPE_RECORD]);
    expect(expenses).toEqual([]);
    expect(incomes).toEqual([UNKNOWN_TYPE_RECORD]);
  });

  it('preserves original record order within each group', () => {
    const r1 = { id: 'a', recordType: 'expense', value: '10', name: 'A' };
    const r2 = { id: 'b', recordType: 'expense', value: '20', name: 'B' };
    const r3 = { id: 'c', recordType: 'income', value: '30', name: 'C' };
    const { expenses, incomes } = splitRecordsByType([r1, r3, r2]);
    expect(expenses.map((r) => r.id)).toEqual(['a', 'b']);
    expect(incomes.map((r) => r.id)).toEqual(['c']);
  });
});
