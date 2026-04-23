import { getStore, promisify, STORES } from './db.js';
import { generateId } from '../utils/idUtils.js';

/**
 * @typedef {'record'|'category'} EntityType
 * @typedef {'created'|'updated'|'deleted'} AuditAction
 *
 * @typedef {Object} AuditEntry
 * @property {string} id
 * @property {EntityType} entityType
 * @property {string} entityId
 * @property {AuditAction} action
 * @property {string} timestamp  ISO string
 * @property {object} snapshot         State of the entity after the action
 * @property {object|null} previousSnapshot  State before the action (null for 'created')
 */

/**
 * @param {{ entityType: EntityType, entityId: string, action: AuditAction, snapshot: object, previousSnapshot?: object }} entry
 * @returns {Promise<AuditEntry|null>}
 */
async function addAuditEntry({ entityType, entityId, action, snapshot, previousSnapshot = null }) {
  const entry = {
    id: generateId(),
    entityType,
    entityId,
    action,
    timestamp: new Date().toISOString(),
    snapshot,
    previousSnapshot,
  };
  try {
    await promisify(getStore(STORES.AUDIT_LOG, 'readwrite').put(entry));
  } catch (err) {
    console.warn('[AuditLog] Could not write audit entry (store may not exist yet):', err);
    return null;
  }
  return entry;
}

/** Returns all audit entries ordered by timestamp descending. */
async function getAllAuditEntries() {
  try {
    const entries = await promisify(getStore(STORES.AUDIT_LOG).getAll());
    return entries.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
  } catch (err) {
    console.warn('[AuditLog] Could not read audit entries:', err);
    return [];
  }
}

/** Removes all audit entries from the store. */
async function clearAuditLog() {
  try {
    return await promisify(getStore(STORES.AUDIT_LOG, 'readwrite').clear());
  } catch (err) {
    console.warn('[AuditLog] Could not clear audit log:', err);
  }
}

export { addAuditEntry, getAllAuditEntries, clearAuditLog };
