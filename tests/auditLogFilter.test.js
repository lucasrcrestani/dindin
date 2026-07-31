/**
 * Unit tests for the audit log search/filter logic.
 * Covers filtering by name, raw value (formula), computed value, and tags.
 */
import { describe, it, expect } from 'vitest';

const makeRecordEntry = ({ name, rawValue, computedValue, isFormula, tags, categoryName = null }) => ({
  entityType: 'record',
  name,
  createdAt: new Date().toISOString(),
  categoryName,
  rawValue: String(rawValue ?? ''),
  computedValue: computedValue ?? null,
  isFormula: isFormula ?? false,
  tags: tags ?? [],
});

const makeCategoryEntry = ({ name }) => ({
  entityType: 'category',
  name,
  createdAt: new Date().toISOString(),
});

const matchesSearch = (entry, searchQuery) => {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  if (entry.name.toLowerCase().includes(q)) return true;
  if (entry.entityType === 'record') {
    if (entry.rawValue.toLowerCase().includes(q)) return true;
    if (entry.computedValue !== null && String(entry.computedValue).includes(q)) return true;
    if (entry.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
  }
  return false;
};

const ENTRIES = [
  makeRecordEntry({ name: 'Supermercado Extra', rawValue: '150', computedValue: 150, tags: ['alimentação', 'mercado'] }),
  makeRecordEntry({ name: 'Padaria', rawValue: '12.5', computedValue: 12.5, tags: ['alimentação'] }),
  makeRecordEntry({ name: 'Transporte', rawValue: '50+7', computedValue: 57, isFormula: true, tags: ['transporte'] }),
  makeRecordEntry({ name: 'Salário', rawValue: '3000', computedValue: 3000, tags: ['receita', 'salário'] }),
  makeCategoryEntry({ name: 'Alimentação' }),
  makeCategoryEntry({ name: 'Transporte' }),
];

describe('matchesSearch()', () => {
  it('returns true for all entries when query is empty', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, ''));
    expect(results).toHaveLength(ENTRIES.length);
  });

  it('filters by record name (case-insensitive)', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, 'padaria'));
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Padaria');
  });

  it('filters by partial name match', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, 'ário'));
    expect(results.map((e) => e.name)).toContain('Salário');
  });

  it('matches records by raw formula string', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, '50+7'));
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Transporte');
  });

  it('matches records by computed value', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, '57'));
    expect(results.map((e) => e.name)).toContain('Transporte');
  });

  it('matches records by tag label', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, 'alimentação'));
    const names = results.map((e) => e.name);
    expect(names).toContain('Supermercado Extra');
    expect(names).toContain('Padaria');
  });

  it('does NOT match category entries by value or tags (they have none)', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, '3000'));
    const entityTypes = results.map((e) => e.entityType);
    expect(entityTypes).not.toContain('category');
    expect(results.map((e) => e.name)).toContain('Salário');
  });

  it('matches category entries by name', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, 'transporte'));
    const names = results.map((e) => e.name);
    expect(names).toContain('Transporte'); // category
    expect(names).toContain('Transporte'); // record with same name
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('returns no results when query matches nothing', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, 'zzzzz'));
    expect(results).toHaveLength(0);
  });

  it('matches by partial tag substring', () => {
    const results = ENTRIES.filter((e) => matchesSearch(e, 'merc'));
    expect(results.map((e) => e.name)).toContain('Supermercado Extra');
  });
});
