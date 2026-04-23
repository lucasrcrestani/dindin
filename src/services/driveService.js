import { getSettings, saveSettings } from './settingsService.js';
import { getExportPayload, importDataFromObject, isPayloadNewer } from './importExportService.js';

// ── Configuration ─────────────────────────────────────────────────────────────
// Credentials are provided by the user at first-sync and stored in localStorage.
// See: https://console.developers.google.com/auth/clients
const CREDENTIALS_KEY  = 'dindin_drive_config';
const DRIVE_SCOPE      = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY        = 'dindin_drive_token';
const DRIVE_FILES_URL  = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// ── Credential helpers ────────────────────────────────────────────────────────
/** Returns the stored Google API credentials, or null if not set. */
function getCredentials() {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Returns true if all required credentials are stored. */
function hasCredentials() {
  const creds = getCredentials();
  return !!(creds?.clientId && creds?.apiKey && creds?.appId);
}

/** Persists Google API credentials to localStorage. */
function saveCredentials({ clientId, apiKey, appId }) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ clientId, apiKey, appId }));
}

/** Removes stored credentials from localStorage. */
function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
}

// ── Internal state ────────────────────────────────────────────────────────────
let _tokenClient       = null;
let _autoSyncTimer     = null;

// ── Token helpers ─────────────────────────────────────────────────────────────
function _saveToken(response) {
  const expiresAt = Date.now() + (response.expires_in - 60) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: response.access_token, expires_at: expiresAt }));
}

/** Returns the stored access token if it is still valid, otherwise null. */
function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { access_token, expires_at } = JSON.parse(raw);
    return Date.now() < expires_at ? access_token : null;
  } catch {
    return null;
  }
}

function _clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Ensures the GIS token client is initialised.
 * Waits up to 10 s for the GIS library to finish loading (handles the race
 * condition where gsi/client loads before the ES module runs).
 */
function _ensureTokenClient() {
  if (_tokenClient) return Promise.resolve();

  // GIS may have already loaded before our module ran
  if (window.google?.accounts?.oauth2) {
    initGoogleAuth();
    return Promise.resolve();
  }

  // Poll until GIS is available or timeout
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(check);
      reject(new Error('Google Identity Services não carregou. Verifique sua conexão e recarregue a página.'));
    }, 10_000);

    const check = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(check);
        clearTimeout(timer);
        initGoogleAuth();
        resolve();
      }
    }, 100);
  });
}

/** Requests an access token via GIS, overrides the shared callback each time. */
async function _requestToken({ prompt = '' } = {}) {
  await _ensureTokenClient();
  return new Promise((resolve, reject) => {
    _tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description ?? response.error));
        return;
      }
      _saveToken(response);
      resolve(response.access_token);
    };
    _tokenClient.requestAccessToken({ prompt });
  });
}

/**
 * Returns a valid token.
 * @param {object} opts
 * @param {boolean} opts.silent - When true, never shows a popup; fires
 *   dindin:drive-auth-needed and throws instead of opening the OAuth flow.
 */
async function _getValidToken({ silent = false } = {}) {
  const stored = getStoredToken();
  if (stored) return stored;
  if (silent) {
    window.dispatchEvent(new CustomEvent('dindin:drive-auth-needed'));
    throw new Error('Token expirado. Clique no botão de sincronização para reconectar.');
  }
  return _requestToken({ prompt: '' });
}

// ── Public auth ───────────────────────────────────────────────────────────────
/** Initialise the GIS token client. Must be called once after the GIS library loads. */
function initGoogleAuth() {
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciais do Google não configuradas.');
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: creds.clientId,
    scope: DRIVE_SCOPE,
    callback: () => {}, // replaced per-request inside _requestToken
  });
}

/** Triggers the OAuth consent screen (first-time sign-in). */
async function signIn() {
  return _requestToken({ prompt: 'consent' });
}

/** Revokes the token, clears local state and persisted drive settings. */
async function signOut() {
  const token = getStoredToken();
  _clearToken();
  stopAutoSync();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  const settings = await getSettings();
  await saveSettings({ ...settings, driveConnected: false, driveFileId: null, driveFileName: null, lastSyncedAt: null });
}

// ── Drive REST helpers ────────────────────────────────────────────────────────
async function _authFetch(url, options = {}, { silent = false } = {}) {
  const token = await _getValidToken({ silent });
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive API ${response.status}: ${body}`);
  }
  return response;
}

function _buildMultipartBody(metadata, payload) {
  const boundary = `dindin_${Date.now()}`;
  const json = JSON.stringify(payload, null, 2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;
  return { contentType: `multipart/related; boundary="${boundary}"`, body };
}

/** Downloads a Drive file and returns its parsed JSON content. */
async function downloadFile(fileId, { silent = false } = {}) {
  const res = await _authFetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {}, { silent });
  return res.json();
}

/** Updates an existing Drive file with a new JSON payload. */
async function uploadFile(fileId, fileName, payload, { silent = false } = {}) {
  const { contentType, body } = _buildMultipartBody({ name: fileName }, payload);
  await _authFetch(
    `${DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}?uploadType=multipart`,
    { method: 'PATCH', headers: { 'Content-Type': contentType }, body },
    { silent },
  );
}

/** Creates a new Drive file and returns its metadata ({ id, name, … }). */
async function createFile(name, payload) {
  const { contentType, body } = _buildMultipartBody({ name }, payload);
  const res = await _authFetch(
    `${DRIVE_UPLOAD_URL}?uploadType=multipart`,
    { method: 'POST', headers: { 'Content-Type': contentType }, body },
  );
  return res.json();
}

// ── Sync logic ────────────────────────────────────────────────────────────────
/**
 * Pull-only sync:
 *   1. Download Drive file
 *   2. Compare freshness via max createdAt across records
 *   3a. If Drive is newer → overwrite local DB automatically
 *   3b. If Drive is older/equal → dispatch dindin:sync-confirmation-needed for user to decide
 *
 * @param {object} opts
 * @param {boolean} opts.silent - Pass true for background auto-sync (no popup on token expiry).
 */
async function syncWithDrive({ silent = true } = {}) {
  const settings = await getSettings();
  if (!settings.driveConnected || !settings.driveFileId) return;

  // 1. Download
  let drivePayload = {};
  try {
    drivePayload = await downloadFile(settings.driveFileId, { silent });
  } catch (err) {
    if (!err.message.includes('404')) throw err;
    // File was deleted from Drive — nothing to import
    return;
  }

  // 2. Check freshness
  const localPayload = await getExportPayload();
  if (isPayloadNewer(drivePayload, localPayload)) {
    // 3a. Auto-import: Drive has newer data
    await _applyDrivePayload(drivePayload);
  } else {
    // 3b. Drive data is older or equal — ask for confirmation
    window.dispatchEvent(new CustomEvent('dindin:sync-confirmation-needed', { detail: { payload: drivePayload } }));
  }
}

/**
 * Imports a Drive payload and updates lastSyncedAt.
 * Used internally and by confirmImportFromDrive.
 */
async function _applyDrivePayload(payload) {
  await importDataFromObject(payload);
  const now = new Date().toISOString();
  const fresh = await getSettings();
  await saveSettings({ ...fresh, lastSyncedAt: now });
  window.dispatchEvent(new CustomEvent('dindin:drive-synced', { detail: { lastSyncedAt: now } }));
  window.dispatchEvent(new CustomEvent('dindin:reload'));
}

/**
 * Imports a Drive payload that was previously deferred for user confirmation.
 * Call this after the user confirms overwriting local data with older/same Drive data.
 */
async function confirmImportFromDrive(payload) {
  await _applyDrivePayload(payload);
}

/** Starts the 60-second auto-sync interval. Replaces any existing interval. */
function startAutoSync() {
  stopAutoSync();
  _autoSyncTimer = setInterval(async () => {
    try {
      await syncWithDrive({ silent: true });
    } catch (err) {
      console.error('[DriveSync] Auto-sync failed:', err);
      window.dispatchEvent(new CustomEvent('dindin:drive-sync-error', { detail: { message: err.message } }));
    }
  }, 60_000);
}

/** Clears the auto-sync interval. */
function stopAutoSync() {
  if (_autoSyncTimer !== null) {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = null;
  }
}

export {
  getCredentials,
  hasCredentials,
  saveCredentials,
  clearCredentials,
  initGoogleAuth,
  getStoredToken,
  signIn,
  signOut,
  downloadFile,
  createFile,
  syncWithDrive,
  confirmImportFromDrive,
  startAutoSync,
  stopAutoSync,
};
