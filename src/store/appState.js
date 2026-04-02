/**
 * Simple pub/sub state container.
 * Subscribers are notified any time setState is called.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/** @type {Object} */
const state = {
  settings: null,
  categories: [],
  records: [],
  commonRecordNames: [],
  currentView: 'main', // 'main' | 'categories' | 'settings'
};

function getState() {
  return { ...state };
}

/** @param {Partial<typeof state>} partial */
function setState(partial) {
  Object.assign(state, partial);
  const keys = Object.keys(partial);
  keys.forEach((key) => {
    if (listeners.has(key)) {
      listeners.get(key).forEach((fn) => fn(state[key], state));
    }
  });
  if (listeners.has('*')) {
    listeners.get('*').forEach((fn) => fn(state));
  }
}

/**
 * Subscribe to state changes.
 * @param {string} key - state key or '*' for any change
 * @param {Function} fn
 * @returns {() => void} unsubscribe function
 */
function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

export { getState, setState, subscribe };
