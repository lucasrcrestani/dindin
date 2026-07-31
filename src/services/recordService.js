import { getStore, promisify, STORES } from './db.js';
import { createRecord } from '../models/Record.js';
import { generateId } from '../utils/idUtils.js';
import { incrementMonth } from '../utils/dateUtils.js';
import { getRawCategoryById } from './categoryService.js';
import { hydrateEntityTags, hydrateEntityTagsList, resolveInputTagIds } from './tagService.js';

async function getAllRawRecords() {
  return promisify(getStore(STORES.RECORDS).getAll());
}

async function getAllRecords() {
  const records = await getAllRawRecords();
  return hydrateEntityTagsList(records);
}

async function getRawRecordsByMonth(month) {
  const index = getStore(STORES.RECORDS).index('month');
  return promisify(index.getAll(IDBKeyRange.only(month)));
}

async function getRecordsByMonth(month) {
  const records = await getRawRecordsByMonth(month);
  return hydrateEntityTagsList(records);
}

/**
 * Gets records by category ID, including records that share tags with the category
 * and have the same record type (income/expense).
 * 
 * @param {string} categoryId - The category ID to search for
 * @returns {Promise<Object[]>} Array of matching records
 */
async function getRecordsByCategory(categoryId) {
  const category = await getRawCategoryById(categoryId);
  if (!category) {
    console.log('[Record] Categoria não encontrada para ID:', categoryId);
    return [];
  }

  const allRecords = await getAllRawRecords();
  const categoryTagIds = category.tagIds ?? [];
  const matchingRecords = allRecords.filter((record) => {
    if (record.recordType !== category.recordType) return false;
    if (categoryTagIds.length === 0) return false;
    const recordTagIds = record.tagIds ?? [];
    return categoryTagIds.every((tagId) => recordTagIds.includes(tagId));
  });

  console.log('[Record] Registros encontrados por categoria e tags:', matchingRecords.length, 'registros');
  return hydrateEntityTagsList(matchingRecords);
}

async function saveRecord(data) {
  const tagIds = await resolveInputTagIds(data, true);
  if (!data.recordType) {
    throw new Error('Tipo do lançamento é obrigatório.');
  }

  const record = data.id
    ? { ...data, tagIds, updatedAt: new Date().toISOString() }
    : createRecord({ ...data, tagIds });
  delete record.tags;
  await promisify(getStore(STORES.RECORDS, 'readwrite').put(record));
  console.log('[Record] Registro salvo:', record.name, `(id: ${record.id}, type: ${record.isRecurring ? 'recurring' : record.isInstallment ? 'installment' : 'simple'})`);
  return hydrateEntityTags(record);
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
  const hydratedRecords = await hydrateEntityTagsList(records);
  return hydratedRecords.sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
}

/**
 * Creates N installment records starting from the given date, one per month.
 * @param {{ recordType: string, value: string, name: string, date: string, tags?: string[], tagIds?: string[], registeredInCurrentMonth?: boolean, currentMonthOverride?: string }} data
 * @param {number} installmentCount
 * @returns {Promise<object[]>} the created records
 */
async function saveInstallmentGroup(data, installmentCount) {
  const tagIds = await resolveInputTagIds(data, true);
  const groupId = generateId();
  const created = [];
  let currentMonth = data.date.slice(0, 7);
  const day = data.date.slice(8, 10);

  for (let i = 0; i < installmentCount; i++) {
    const date = `${currentMonth}-${day}`;
    const isFirstAndOverridden = i === 0 && data.registeredInCurrentMonth && data.currentMonthOverride;
    const record = createRecord({
      recordType: data.recordType,
      value: data.value,
      name: data.name,
      date,
      tagIds,
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

  return hydrateEntityTagsList(created);
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
    const updated = { ...r, month: currentMonth, date: `${currentMonth}-${originalDay}`, updatedAt: new Date().toISOString() };
    await promisify(getStore(STORES.RECORDS, 'readwrite').put(updated));
  }
}

/**
 * Updates name, value, type, and tags for the given record and all future records
 * in the same installment group (installmentNumber >= record.installmentNumber).
 * @param {object} record - the updated record (already has new name/value/type/tags)
 */
async function updateInstallmentFromCurrent(record) {
  const tagIds = await resolveInputTagIds(record, true);
  const records = await getInstallmentsByGroupId(record.installmentGroupId);
  for (const r of records) {
    if (r.installmentNumber >= record.installmentNumber) {
      const updated = {
        ...r,
        name: record.name,
        value: record.value,
        recordType: record.recordType,
        tagIds,
        updatedAt: new Date().toISOString(),
      };
      delete updated.tags;
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
  records.forEach((record) => (record.tags || []).forEach((tag) => tagSet.add(tag)));
  return [...tagSet].sort();
}

export {
  getAllRecords,
  getAllRawRecords,
  getRecordsByMonth,
  getRawRecordsByMonth,
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
