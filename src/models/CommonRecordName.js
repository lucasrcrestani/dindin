import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} CommonRecordName
 * @property {string} id
 * @property {string} name
 */

/**
 * @param {string} name
 * @returns {CommonRecordName}
 */
function createCommonRecordName(name) {
  return { id: generateId(), name };
}

export { createCommonRecordName };
