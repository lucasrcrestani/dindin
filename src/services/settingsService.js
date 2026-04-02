import { getStore, promisify, STORES } from './db.js';
import { defaultSettings } from '../models/ProjectSettings.js';

const SETTINGS_KEY = 'main';

async function getSettings() {
  const stored = await promisify(getStore(STORES.SETTINGS).get(SETTINGS_KEY));
  return stored ?? { id: SETTINGS_KEY, ...defaultSettings() };
}

async function saveSettings(settings) {
  const data = { id: SETTINGS_KEY, ...settings };
  await promisify(getStore(STORES.SETTINGS, 'readwrite').put(data));
  return data;
}

export { getSettings, saveSettings };
