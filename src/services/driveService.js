import { getSettings, saveSettings } from './settingsService.js';
import { getExportPayload, importDataFromObject, isPayloadNewer, arePayloadsInSync, getPayloadTimestamp } from './importExportService.js';

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
let _syncInProgress    = false;

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
    console.warn('[DriveSync] Token expirado durante sync automático — intervenção do usuário necessária');
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
 * Bidirectional sync with full-replacement strategy:
 *   - If Drive data is newer → overwrite local DB with Drive data
 *   - If local data is newer → push local data to Drive
 *   - If in sync → only update lastSyncedAt
 *
 * Freshness is determined by the maximum updatedAt (falling back to createdAt)
 * across all records in each payload.
 *
 * @param {object} opts
 * @param {boolean} opts.silent - Pass true for background auto-sync (no popup on token expiry).
 */
async function syncWithDrive({ silent = true } = {}) {
  if (_syncInProgress) {
    console.log('[DriveSync] Sync ignorado — outro sync já está em andamento');
    return;
  }
  _syncInProgress = true;
  const startedAt = new Date().toISOString();
  console.log(`[DriveSync] Sync iniciado em ${startedAt}`);

  try {
    const settings = await getSettings();
    if (!settings.driveConnected || !settings.driveFileId) {
      console.log('[DriveSync] Sync ignorado — Drive não conectado ou sem fileId');
      return;
    }

    // 1. Download Drive file
    let drivePayload;
    try {
      drivePayload = await downloadFile(settings.driveFileId, { silent });
      console.log('[DriveSync] Arquivo do Drive baixado com sucesso');
    } catch (err) {
      if (err.message.includes('404')) {
        console.warn('[DriveSync] Arquivo do Drive não encontrado (404) — foi deletado externamente?');
        window.dispatchEvent(new CustomEvent('dindin:drive-sync-error', {
          detail: { message: 'Arquivo do Drive não encontrado. Reconecte nas configurações.' },
        }));
        return;
      }
      throw err;
    }

    // 2. Compare freshness
    const localPayload = await getExportPayload();
    const driveTs = getPayloadTimestamp(drivePayload);
    const localTs = getPayloadTimestamp(localPayload);
    console.log(`[DriveSync] Timestamp Drive: ${driveTs ?? 'nenhum'} | Timestamp local: ${localTs ?? 'nenhum'}`);

    const now = new Date().toISOString();

    if (isPayloadNewer(drivePayload, localPayload)) {
      // 3a. Drive is newer → overwrite local
      console.log('[DriveSync] Decisão: Drive é mais novo → substituindo dados locais');
      await importDataFromObject(drivePayload);
      const fresh = await getSettings();
      await saveSettings({ ...fresh, lastSyncedAt: now });
      console.log('[DriveSync] Dados locais substituídos com sucesso');
      window.dispatchEvent(new CustomEvent('dindin:drive-synced', { detail: { lastSyncedAt: now } }));
      window.dispatchEvent(new CustomEvent('dindin:reload'));
    } else if (isPayloadNewer(localPayload, drivePayload)) {
      // 3b. Local is newer → push to Drive
      console.log('[DriveSync] Decisão: local é mais novo → enviando dados ao Drive');
      await uploadFile(settings.driveFileId, settings.driveFileName, localPayload, { silent });
      const fresh = await getSettings();
      await saveSettings({ ...fresh, lastSyncedAt: now });
      console.log('[DriveSync] Dados enviados ao Drive com sucesso');
      window.dispatchEvent(new CustomEvent('dindin:drive-synced', { detail: { lastSyncedAt: now } }));
    } else {
      // 3c. In sync — just refresh lastSyncedAt
      console.log('[DriveSync] Decisão: dados em sincronia — nenhuma alteração necessária');
      const fresh = await getSettings();
      await saveSettings({ ...fresh, lastSyncedAt: now });
      window.dispatchEvent(new CustomEvent('dindin:drive-synced', { detail: { lastSyncedAt: now } }));
    }

    console.log(`[DriveSync] Sync concluído em ${new Date().toISOString()}`);
  } finally {
    _syncInProgress = false;
  }
}

/**
 * @deprecated The new syncWithDrive() handles all cases automatically via full-replacement.
 * Kept for backward compatibility with UI event listeners.
 */
async function confirmImportFromDrive(_payload) {
  console.warn('[DriveSync] confirmImportFromDrive está deprecado — use syncWithDrive() diretamente');
  await syncWithDrive({ silent: false });
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
  uploadFile,
  createFile,
  syncWithDrive,
  confirmImportFromDrive,
  startAutoSync,
  stopAutoSync,
};
