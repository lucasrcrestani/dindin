import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string[]} tagIds
 * @property {import('./RecordType.js').default} recordType
 * @property {number} idealValue
 * @property {string} createdAt  - ISO string
 * @property {string} updatedAt  - ISO string, updated on every save
 */

/**
 * @param {Omit<Category, 'id' | 'createdAt' | 'updatedAt'>} data
 * @returns {Category}
 */
function createCategory({ name, tagIds = [], recordType, idealValue = 0 }) {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    tagIds,
    recordType,
    idealValue,
    createdAt: now,
    updatedAt: now,
  };
}

export { createCategory };
