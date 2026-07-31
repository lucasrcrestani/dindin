import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {Object} Tag
 * @property {string} id
 * @property {string} name
 * @property {string} normalizedName
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {{ name: string }} data
 * @returns {Tag}
 */
function createTag({ name }) {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    normalizedName: String(name ?? '').trim().toLowerCase(),
    createdAt: now,
    updatedAt: now,
  };
}

export { createTag };