import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} CommonRecordName
 * @property {string} id
 * @property {string} name
 * @property {string} updatedAt  - ISO string, set on creation
 */

/**
 * @param {string} name
 * @returns {CommonRecordName}
 */
function createCommonRecordName(name) {
  return { id: generateId(), name, updatedAt: new Date().toISOString() };
}

export { createCommonRecordName };
