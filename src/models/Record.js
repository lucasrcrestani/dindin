import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Record
 * @property {string} id
 * @property {string} categoryId
 * @property {string|number} value - Raw formula string (e.g. "50+7") or legacy numeric value.
 * @property {string} name
 * @property {string} date        - format: YYYY-MM-DD (date the record happened)
 * @property {string} month       - format: YYYY-MM (derived from date, used for filtering)
 * @property {boolean} isRecurring - whether the record repeats every month
 * @property {boolean} isInstallment - whether the record is part of an installment group
 * @property {string|null} installmentGroupId - shared ID for all records in the same installment purchase
 * @property {number|null} installmentNumber  - 1-based index of this installment
 * @property {number|null} installmentTotal   - total number of installments in the group
 * @property {string} createdAt   - ISO string
 */

/**
 * @param {Omit<Record, 'id' | 'createdAt' | 'month'>} data
 * @returns {Record}
 */
function createRecord({ categoryId, value, name, date, isRecurring, isInstallment, installmentGroupId, installmentNumber, installmentTotal }) {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
  const month = resolvedDate.slice(0, 7); // YYYY-MM
  return {
    id: generateId(),
    categoryId,
    value,
    name,
    date: resolvedDate,
    month,
    isRecurring: isRecurring ?? false,
    isInstallment: isInstallment ?? false,
    installmentGroupId: installmentGroupId ?? null,
    installmentNumber: installmentNumber ?? null,
    installmentTotal: installmentTotal ?? null,
    createdAt: new Date().toISOString(),
  };
}

export { createRecord };
