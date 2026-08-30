import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Record
 * @property {string} id
 * @property {import('./RecordType.js').default|null} recordType
 * @property {string|number} value - Raw formula string (e.g. "50+7") or legacy numeric value.
 * @property {string} name
 * @property {string} date        - format: YYYY-MM-DD (date the record happened)
 * @property {string} month       - format: YYYY-MM (normally derived from date; may differ when registeredInCurrentMonth is true)
 * @property {string[]} tagIds    - normalized tag IDs for this record
 * @property {boolean} isRecurring - whether the record repeats every month
 * @property {boolean} isInstallment - whether the record is part of an installment group
 * @property {string|null} installmentGroupId - shared ID for all records in the same installment purchase
 * @property {number|null} installmentNumber  - 1-based index of this installment
 * @property {number|null} installmentTotal   - total number of installments in the group
 * @property {boolean} registeredInCurrentMonth - when true, record was intentionally assigned to the month of createdAt even though date is in a future month
 * @property {string|null} fitId  - FITID from OFX import; null for manually created records
 * @property {string} createdAt   - ISO string
 * @property {string} updatedAt   - ISO string, updated on every save
 */

/**
 * @param {Omit<Record, 'id' | 'createdAt' | 'updatedAt'> & { month?: string }} data
 * @returns {Record}
 */
function createRecord({ recordType = null, value, name, date, month: monthOverride, tagIds, isRecurring, isInstallment, installmentGroupId, installmentNumber, installmentTotal, registeredInCurrentMonth, fitId = null }) {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
  const month = monthOverride ?? resolvedDate.slice(0, 7); // YYYY-MM
  const now = new Date().toISOString();
  return {
    id: generateId(),
    recordType,
    value,
    name,
    date: resolvedDate,
    month,
    tagIds: tagIds ?? [],
    isRecurring: isRecurring ?? false,
    isInstallment: isInstallment ?? false,
    installmentGroupId: installmentGroupId ?? null,
    installmentNumber: installmentNumber ?? null,
    installmentTotal: installmentTotal ?? null,
    registeredInCurrentMonth: registeredInCurrentMonth ?? false,
    fitId: fitId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export { createRecord };
