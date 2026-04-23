import RecordType from '../models/RecordType.js';
import { parseFormula } from './formulaUtils.js';

const YELLOW_THRESHOLD = 0.75;

/** @typedef {'green'|'yellow'|'red'} BalanceStatus */

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
  const totals = new Map();
  for (const record of monthRecords) {
    totals.set(record.categoryId, (totals.get(record.categoryId) ?? 0) + (parseFormula(record.value) ?? 0));
  }

  return categories.map((category) => {
    const actual = totals.get(category.id) ?? 0;
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
 * expenses (Gasto)    = sum of actual of expense categories
 * balance             = sum of actual income - expenses
 * @param {CategoryBalance[]} categoryBalances
 * @returns {{ income: number, expenses: number, balance: number, actualIncome: number, status: BalanceStatus }}
 */
function computeGeneralBalance(categoryBalances) {
  const incomeBalances  = categoryBalances.filter((b) => b.category.recordType === RecordType.INCOME);
  const expenseBalances = categoryBalances.filter((b) => b.category.recordType === RecordType.EXPENSE);

  const income      = incomeBalances.reduce((sum, b) => sum + b.idealValue, 0);
  const actualIncome = incomeBalances.reduce((sum, b) => sum + b.actual, 0);
  const expenses    = expenseBalances.reduce((sum, b) => sum + b.actual, 0);
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
      const categoryRecords = records.filter((r) => r.categoryId === category.id);
      if (categoryRecords.length > 0) {
        total += categoryRecords.reduce((sum, r) => sum + (parseFormula(r.value) ?? 0), 0);
        monthsWithRecords++;
      }
    }
    result.set(category.id, monthsWithRecords > 0 ? total / monthsWithRecords : null);
  }
  return result;
}

export { getCategoryStatus, getIncomeCategoryStatus, computeCategoryBalances, computeGeneralBalance, computeHistoricalAverages };
