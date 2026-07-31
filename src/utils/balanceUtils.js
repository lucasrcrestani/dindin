import RecordType from '../models/RecordType.js';
import { parseFormula } from './formulaUtils.js';

const YELLOW_THRESHOLD = 0.75;

/** @typedef {'green'|'yellow'|'red'} BalanceStatus */

function recordMatchesCategory(record, category) {
  const categoryTagIds = category?.tagIds ?? [];
  const recordTagIds = record?.tagIds ?? [];
  if (!category || !record) return false;
  if (record.recordType !== category.recordType) return false;
  if (categoryTagIds.length === 0) return false;
  return categoryTagIds.every((tagId) => recordTagIds.includes(tagId));
}

function getCategoryRecords(category, records = []) {
  return records.filter((record) => recordMatchesCategory(record, category));
}

function findBestMatchingCategory(record, categories = []) {
  const matches = categories.filter((category) => recordMatchesCategory(record, category));
  if (matches.length === 0) return null;
  matches.sort((left, right) => {
    const tagDiff = (right.tagIds?.length ?? 0) - (left.tagIds?.length ?? 0);
    if (tagDiff !== 0) return tagDiff;
    return String(left.name).localeCompare(String(right.name), 'pt-BR');
  });
  return matches[0];
}

/**
 * Status for expense categories: red if over budget, yellow if close, green otherwise.
 * @param {number} actual
 * @param {number} idealValue
 * @returns {BalanceStatus}
 */
function getCategoryStatus(actual, idealValue) {
  if (idealValue <= 0) return 'green';
  const ratio = actual / idealValue;
  if (ratio > 1) return 'red';
  if (ratio >= YELLOW_THRESHOLD) return 'yellow';
  return 'green';
}

/**
 * Status for income categories: red if below threshold, yellow if close to ideal, green if met.
 * @param {number} actual
 * @param {number} idealValue
 * @returns {BalanceStatus}
 */
function getIncomeCategoryStatus(actual, idealValue) {
  if (idealValue <= 0) return 'green';
  const ratio = actual / idealValue;
  if (ratio >= 1) return 'green';
  if (ratio >= YELLOW_THRESHOLD) return 'yellow';
  return 'red';
}

/**
 * @typedef {Object} CategoryBalance
 * @property {import('../models/Category.js').Category} category
 * @property {number} actual
 * @property {number} idealValue
 * @property {BalanceStatus} status
 * @property {number|null} historicalAverage
 */

/**
 * Compute per-category balance for a given month.
 * Includes all expense AND income categories (actual = 0 when no records).
 * @param {import('../models/Category.js').Category[]} categories
 * @param {import('../models/Record.js').Record[]} monthRecords
 * @returns {CategoryBalance[]}
 */
function computeCategoryBalances(categories, monthRecords) {
  return categories.map((category) => {
    const actual = getCategoryRecords(category, monthRecords)
      .reduce((sum, record) => sum + (parseFormula(record.value) ?? 0), 0);
    const idealValue = category.idealValue ?? 0;
    const status = category.recordType === RecordType.INCOME
      ? getIncomeCategoryStatus(actual, idealValue)
      : getCategoryStatus(actual, idealValue);
    return { category, actual, idealValue, status };
  });
}

/**
 * Compute the general balance for the month.
 * income  (Previsto)  = sum of idealValue of income categories
 * expenses (Gasto)    = sum of unique expense records
 * balance             = sum of unique actual income - unique expenses
 * @param {CategoryBalance[]} categoryBalances
 * @param {import('../models/Record.js').Record[]} monthRecords
 * @returns {{ income: number, expenses: number, balance: number, actualIncome: number, status: BalanceStatus }}
 */
function computeGeneralBalance(categoryBalances, monthRecords = []) {
  const incomeBalances  = categoryBalances.filter((b) => b.category.recordType === RecordType.INCOME);

  const seen = new Set();
  const uniqueMonthRecords = [];
  for (const record of monthRecords) {
    const key = record?.id ? `id:${record.id}` : null;
    if (!key) {
      uniqueMonthRecords.push(record);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMonthRecords.push(record);
  }

  const uniqueExpenseRecords = uniqueMonthRecords.filter((record) => record.recordType === RecordType.EXPENSE);
  const uniqueIncomeRecords = uniqueMonthRecords.filter((record) => record.recordType === RecordType.INCOME);

  const income      = incomeBalances.reduce((sum, b) => sum + b.idealValue, 0);
  const actualIncome = uniqueIncomeRecords.reduce((sum, record) => sum + (parseFormula(record.value) ?? 0), 0);
  const expenses    = uniqueExpenseRecords.reduce((sum, record) => sum + (parseFormula(record.value) ?? 0), 0);
  const balance     = actualIncome - expenses;
  const status      = balance >= 0 ? 'green' : 'red';
  return { income, actualIncome, expenses, balance, status };
}

/**
 * Compute the historical average per category across a set of period months.
 * Divisor = number of months in which that specific category has at least one record.
 * Returns null for categories with no records in any of the period months.
 * @param {import('../models/Category.js').Category[]} categories
 * @param {Map<string, import('../models/Record.js').Record[]>} recordsByMonth - monthKey → records
 * @param {string[]} periodMonths - ordered list of YYYY-MM keys for the current period
 * @returns {Map<string, number|null>} categoryId → average (or null)
 */
function computeHistoricalAverages(categories, recordsByMonth, periodMonths) {
  const result = new Map();
  for (const category of categories) {
    let total = 0;
    let monthsWithRecords = 0;
    for (const monthKey of periodMonths) {
      const records = recordsByMonth.get(monthKey) ?? [];
      const categoryRecords = getCategoryRecords(category, records);
      if (categoryRecords.length > 0) {
        total += categoryRecords.reduce((sum, r) => sum + (parseFormula(r.value) ?? 0), 0);
        monthsWithRecords++;
      }
    }
    result.set(category.id, monthsWithRecords > 0 ? total / monthsWithRecords : null);
  }
  return result;
}

/**
 * Compute per-category totals for each month in a list of past months.
 * @param {import('../models/Category.js').Category[]} categories
 * @param {Map<string, import('../models/Record.js').Record[]>} recordsByMonth - monthKey → records
 * @param {string[]} months - ordered list of YYYY-MM keys (past months only)
 * @returns {Map<string, {monthKey: string, total: number}[]>} categoryId → array ordered oldest→newest
 */
function computePerMonthCategoryTotals(categories, recordsByMonth, months) {
  const result = new Map();
  for (const category of categories) {
    const monthTotals = months.map((monthKey) => {
      const records = recordsByMonth.get(monthKey) ?? [];
      const total = getCategoryRecords(category, records)
        .reduce((sum, r) => sum + (parseFormula(r.value) ?? 0), 0);
      return { monthKey, total };
    });
    result.set(category.id, monthTotals);
  }
  return result;
}

export {
  getCategoryStatus,
  getIncomeCategoryStatus,
  recordMatchesCategory,
  getCategoryRecords,
  findBestMatchingCategory,
  computeCategoryBalances,
  computeGeneralBalance,
  computeHistoricalAverages,
  computePerMonthCategoryTotals,
};
