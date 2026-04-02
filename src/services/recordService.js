import { getStore, promisify, STORES } from './db.js';
import { createRecord } from '../models/Record.js';

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
  const record = data.id ? data : createRecord(data);
  await promisify(getStore(STORES.RECORDS, 'readwrite').put(record));
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

export {
  getAllRecords,
  getRecordsByMonth,
  getRecordsByCategory,
  saveRecord,
  deleteRecord,
  deleteRecordsByCategory,
};
