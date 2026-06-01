/**
 * Unit tests for the category search filtering logic used in the Record Modal.
 * The component filters categories by name (case-insensitive partial match)
 * and groups results into expenses and incomes.
 */
import { describe, it, expect } from 'vitest';

const CATEGORIES = [
  { id: 'e1', name: 'Alimentação', recordType: 'expense' },
  { id: 'e2', name: 'Aluguel', recordType: 'expense' },
  { id: 'e3', name: 'Transporte', recordType: 'expense' },
  { id: 'i1', name: 'Salário', recordType: 'income' },
  { id: 'i2', name: 'Freelance', recordType: 'income' },
];

const filterCategories = (categories, query) => {
  const q = query.toLowerCase().trim();
  return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
};

describe('filterCategories()', () => {
  it('returns all categories when query is empty', () => {
    const result = filterCategories(CATEGORIES, '');
    expect(result).toHaveLength(5);
  });

  it('returns all categories when query is only whitespace', () => {
    const result = filterCategories(CATEGORIES, '   ');
    expect(result).toHaveLength(5);
  });

  it('filters by partial name match', () => {
    const result = filterCategories(CATEGORIES, 'al');
    expect(result.map((c) => c.id)).toEqual(['e1', 'e2', 'i1']);
  });

  it('is case-insensitive', () => {
    const result = filterCategories(CATEGORIES, 'AL');
    expect(result.map((c) => c.id)).toEqual(['e1', 'e2', 'i1']);
  });

  it('returns categories of different types when both match', () => {
    const result = filterCategories(CATEGORIES, 'a');
    const types = [...new Set(result.map((c) => c.recordType))];
    expect(types).toContain('expense');
    expect(types).toContain('income');
  });

  it('returns empty array when no categories match', () => {
    const result = filterCategories(CATEGORIES, 'zzz');
    expect(result).toHaveLength(0);
  });

  it('matches a single category by exact name', () => {
    const result = filterCategories(CATEGORIES, 'Salário');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i1');
  });
});

describe('category grouping', () => {
  it('correctly separates expenses from incomes in filtered results', () => {
    const filtered = filterCategories(CATEGORIES, '');
    const expenses = filtered.filter((c) => c.recordType === 'expense');
    const incomes = filtered.filter((c) => c.recordType === 'income');
    expect(expenses).toHaveLength(3);
    expect(incomes).toHaveLength(2);
  });

  it('grouping works correctly after filtering', () => {
    const filtered = filterCategories(CATEGORIES, 'al');
    const expenses = filtered.filter((c) => c.recordType === 'expense');
    const incomes = filtered.filter((c) => c.recordType === 'income');
    expect(expenses.map((c) => c.id)).toEqual(['e1', 'e2']);
    expect(incomes.map((c) => c.id)).toEqual(['i1']);
  });
});
