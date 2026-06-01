import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Record
 * @property {string} id
 * @property {string} categoryId
 * @property {string|number} value - Raw formula string (e.g. "50+7") or legacy numeric value.
 * @property {string} name
 * @property {string} date        - format: YYYY-MM-DD (date the record happened)
 * @property {string} month       - format: YYYY-MM (normally derived from date; may differ when registeredInCurrentMonth is true)
 * @property {string[]} tags      - optional labels for this record
 * @property {boolean} isRecurring - whether the record repeats every month
 * @property {boolean} isInstallment - whether the record is part of an installment group
 * @property {string|null} installmentGroupId - shared ID for all records in the same installment purchase
 * @property {number|null} installmentNumber  - 1-based index of this installment
 * @property {number|null} installmentTotal   - total number of installments in the group
 * @property {boolean} registeredInCurrentMonth - when true, record was intentionally assigned to the month of createdAt even though date is in a future month
 * @property {string} createdAt   - ISO string
 * @property {string} updatedAt   - ISO string, updated on every save
 */

/**
 * @param {Omit<Record, 'id' | 'createdAt' | 'updatedAt'> & { month?: string }} data
 * @returns {Record}
 */
function createRecord({ categoryId, value, name, date, month: monthOverride, tags, isRecurring, isInstallment, installmentGroupId, installmentNumber, installmentTotal, registeredInCurrentMonth }) {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
  const month = monthOverride ?? resolvedDate.slice(0, 7); // YYYY-MM
  const now = new Date().toISOString();
  return {
    id: generateId(),
    categoryId,
    value,
    name,
    date: resolvedDate,
    month,
    tags: tags ?? [],
    isRecurring: isRecurring ?? false,
    isInstallment: isInstallment ?? false,
    installmentGroupId: installmentGroupId ?? null,
    installmentNumber: installmentNumber ?? null,
    installmentTotal: installmentTotal ?? null,
    registeredInCurrentMonth: registeredInCurrentMonth ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export { createRecord };
