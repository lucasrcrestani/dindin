import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Record
 * @property {string} id
 * @property {string} categoryId
 * @property {string|number} value - Raw formula string (e.g. "50+7") or legacy numeric value.
 * @property {string} name
 * @property {string} date      - format: YYYY-MM-DD (date the record happened)
 * @property {string} month     - format: YYYY-MM (derived from date, used for filtering)
 * @property {string} createdAt - ISO string
 */

/**
 * @param {Omit<Record, 'id' | 'createdAt' | 'month'>} data
 * @returns {Record}
 */
function createRecord({ categoryId, value, name, date }) {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
  const month = resolvedDate.slice(0, 7); // YYYY-MM
  return {
    id: generateId(),
    categoryId,
    value,
    name,
    date: resolvedDate,
    month,
    createdAt: new Date().toISOString(),
  };
}

export { createRecord };
