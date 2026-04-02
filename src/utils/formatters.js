/**
 * Format a number as Brazilian Real currency.
 * @param {number} value
 * @returns {string} e.g. "R$ 1.234,56"
 */
function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Format a YYYY-MM key to a human-readable month label.
 * @param {string} monthKey
 * @returns {string} e.g. "março de 2026"
 */
function formatMonthDisplay(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { formatCurrency, formatMonthDisplay, capitalize };
