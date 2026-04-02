/** @returns {string} Current month key in YYYY-MM format */
function currentMonthKey() {
  const now = new Date();
  return formatMonthKey(now.getFullYear(), now.getMonth() + 1);
}

/**
 * @param {number} year
 * @param {number} month - 1-based
 * @returns {string}
 */
function formatMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * @param {string} monthKey - YYYY-MM
 * @returns {string} next month key
 */
function incrementMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month, 1); // month is 1-based, Date uses 0-based → next month
  return formatMonthKey(date.getFullYear(), date.getMonth() + 1);
}

/**
 * Returns the last N month keys up to and including currentMonth (exclusive of currentMonth).
 * @param {string} currentMonth - YYYY-MM
 * @param {number} count
 * @returns {string[]} ordered oldest → newest
 */
function listPastMonths(currentMonth, count) {
  const result = [];
  let cursor = currentMonth;
  for (let i = 0; i < count; i++) {
    cursor = decrementMonth(cursor);
    result.unshift(cursor);
  }
  return result;
}

/**
 * @param {string} monthKey - YYYY-MM
 * @returns {string} previous month key
 */
function decrementMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 2, 1); // month-2 because Date is 0-based and we go back 1
  return formatMonthKey(date.getFullYear(), date.getMonth() + 1);
}

/**
 * @param {string} monthKey - YYYY-MM
 * @returns {string} e.g. "Março 2026"
 */
function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export { currentMonthKey, formatMonthKey, incrementMonth, listPastMonths, decrementMonth, formatMonthLabel };
