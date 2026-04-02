/** @returns {string} unique id string */
function generateId() {
  return crypto.randomUUID();
}

export { generateId };
