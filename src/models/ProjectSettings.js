/**
 * @typedef {Object} ProjectSettings
 * @property {number} period  - number of months to show in history view
 * @property {string|null} currentMonth  - format: YYYY-MM, null until first record
 */

/** @returns {ProjectSettings} */
function defaultSettings() {
  return {
    period: 3,
    currentMonth: null,
  };
}

export { defaultSettings };
