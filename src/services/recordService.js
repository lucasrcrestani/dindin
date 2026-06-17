import { getStore, promisify, STORES } from './db.js';
import { createRecord } from '../models/Record.js';
import { generateId } from '../utils/idUtils.js';
import { incrementMonth } from '../utils/dateUtils.js';

async function getAllRecords() {
  return promisify(getStore(STORES.RECORDS).getAll());
}

async function getRecordsByMonth(month) {
  const index = getStore(STORES.RECORDS).index('month');
  return promisify(index.getAll(IDBKeyRange.only(month)));
}

async function getRecordsByCategory(categoryId) {
  const index = getStore(STORES.RECORDS).index('categoryId');
  return promisify(index.getAll(IDBKeyRange.only(categoryId)));
}

async function saveRecord(data) {
  const record = data.id
    ? { ...data, updatedAt: new Date().toISOString() }
    : createRecord(data);
  await promisify(getStore(STORES.RECORDS, 'readwrite').put(record));
  console.log('[Record] Registro salvo:', record.name, `(id: ${record.id}, type: ${record.isRecurring ? 'recurring' : record.isInstallment ? 'installment' : 'simple'})`);
  return record;
}

async function deleteRecord(id) {
  return promisify(getStore(STORES.RECORDS, 'readwrite').delete(id));
}

async function deleteRecordsByCategory(categoryId) {
  const records = await getRecordsByCategory(categoryId);
  const store = getStore(STORES.RECORDS, 'readwrite');
  await Promise.all(records.map((r) => promisify(store.delete(r.id))));
}

/** Returns all records for the given month that are marked as recurring. */
async function getRecurringRecordsByMonth(month) {
  const records = await getRecordsByMonth(month);
  return records.filter((r) => r.isRecurring === true);
}

/** Returns all records for the given month that are part of an installment group. */
async function getInstallmentsByMonth(month) {
  const records = await getRecordsByMonth(month);
  return records.filter((r) => r.isInstallment === true);
}

/** Returns all records belonging to a specific installment group, sorted by installmentNumber. */
async function getInstallmentsByGroupId(groupId) {
  const index = getStore(STORES.RECORDS).index('installmentGroupId');
  const records = await promisify(index.getAll(IDBKeyRange.only(groupId)));
  return records.sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
}

/**
 * Creates N installment records starting from the given date, one per month.
 * @param {{ categoryId: string, value: string, name: string, date: string, tags?: string[], registeredInCurrentMonth?: boolean, currentMonthOverride?: string }} data
 * @param {number} installmentCount
 * @returns {Promise<object[]>} the created records
 */
async function saveInstallmentGroup(data, installmentCount) {
  const groupId = generateId();
  const created = [];
  let currentMonth = data.date.slice(0, 7);
  const day = data.date.slice(8, 10);

  for (let i = 0; i < installmentCount; i++) {
    const date = `${currentMonth}-${day}`;
    const isFirstAndOverridden = i === 0 && data.registeredInCurrentMonth && data.currentMonthOverride;
    const record = createRecord({
      categoryId: data.categoryId,
      value: data.value,
      name: data.name,
      date,
      tags: data.tags,
      ...(isFirstAndOverridden ? { month: data.currentMonthOverride, registeredInCurrentMonth: true } : {}),
      isRecurring: false,
      isInstallment: true,
      installmentGroupId: groupId,
      installmentNumber: i + 1,
      installmentTotal: installmentCount,
    });
    await promisify(getStore(STORES.RECORDS, 'readwrite').put(record));
    created.push(record);
    currentMonth = incrementMonth(currentMonth);
  }

  return created;
}

/**
 * Moves all future installment records (month > currentMonth) to currentMonth.
 * @param {string} groupId
 * @param {string} currentMonth - YYYY-MM
 */
async function quitarInstallments(groupId, currentMonth) {
  const records = await getInstallmentsByGroupId(groupId);
  const futureRecords = records.filter((r) => r.month > currentMonth);
  const day = currentMonth.slice(-2) === currentMonth ? '01' : '01'; // always use day 01
  for (const r of futureRecords) {
    const originalDay = r.date.slice(8, 10);
    const updated = { ...r, month: currentMonth, date: `${currentMonth}-${originalDay}` };
    await promisify(getStore(STORES.RECORDS, 'readwrite').put(updated));
  }
}

/**
 * Updates name, value, and categoryId for the given record and all future records
 * in the same installment group (installmentNumber >= record.installmentNumber).
 * @param {object} record - the updated record (already has new name/value/categoryId)
 */
async function updateInstallmentFromCurrent(record) {
  const records = await getInstallmentsByGroupId(record.installmentGroupId);
  for (const r of records) {
    if (r.installmentNumber >= record.installmentNumber) {
      const updated = { ...r, name: record.name, value: record.value, categoryId: record.categoryId };
      await promisify(getStore(STORES.RECORDS, 'readwrite').put(updated));
    }
  }
}

/** Returns all distinct month keys (YYYY-MM) that have at least one record, sorted ascending. */
function getAllMonthsWithRecords() {
  return new Promise((resolve, reject) => {
    const index = getStore(STORES.RECORDS).index('month');
    const months = [];
    const request = index.openKeyCursor(null, 'nextunique');
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        months.push(cursor.key);
        cursor.continue();
      } else {
        resolve(months);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecordTags() {
  const records = await getAllRecords();
  const tagSet = new Set();
  records.forEach(r => (r.tags || []).forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

export {
  getAllRecords,
  getRecordsByMonth,
  getRecordsByCategory,
  getRecurringRecordsByMonth,
  getInstallmentsByMonth,
  getInstallmentsByGroupId,
  saveInstallmentGroup,
  quitarInstallments,
  updateInstallmentFromCurrent,
  saveRecord,
  deleteRecord,
  deleteRecordsByCategory,
  getAllMonthsWithRecords,
  getAllRecordTags,
};
