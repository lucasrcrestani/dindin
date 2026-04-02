import { getStore, promisify, STORES } from './db.js';
import { createCommonRecordName } from '../models/CommonRecordName.js';

async function getAllCommonRecordNames() {
  return promisify(getStore(STORES.COMMON_RECORD_NAMES).getAll());
}

async function addCommonRecordName(name) {
  const all = await getAllCommonRecordNames();
  const exists = all.some((e) => e.name.toLowerCase() === name.toLowerCase());
  if (exists) return null;
  const entry = createCommonRecordName(name);
  await promisify(getStore(STORES.COMMON_RECORD_NAMES, 'readwrite').put(entry));
  return entry;
}

async function deleteCommonRecordName(id) {
  return promisify(getStore(STORES.COMMON_RECORD_NAMES, 'readwrite').delete(id));
}

export { getAllCommonRecordNames, addCommonRecordName, deleteCommonRecordName };
