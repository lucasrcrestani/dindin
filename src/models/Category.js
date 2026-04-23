import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string[]} tags
 * @property {import('./RecordType.js').default} recordType
 * @property {number} idealValue
 */

/**
 * @param {Omit<Category, 'id'>} data
 * @returns {Category}
 */
function createCategory({ name, tags = [], recordType, idealValue = 0 }) {
  return {
    id: generateId(),
    name,
    tags,
    recordType,
    idealValue,
    createdAt: new Date().toISOString(),
  };
}

export { createCategory };
