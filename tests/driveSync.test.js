/**
 * Unit tests for syncWithDrive() decision logic.
 * All external dependencies (DB, Drive API, settings) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted before imports) ─────────────────────────────────────
vi.mock('../src/services/settingsService.js', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/services/importExportService.js', () => ({
  getExportPayload:    vi.fn(),
  importDataFromObject: vi.fn().mockResolvedValue(undefined),
  isPayloadNewer:      vi.fn(),
  arePayloadsInSync:   vi.fn(),
  getPayloadTimestamp: vi.fn().mockReturnValue('2025-01-01T00:00:00.000Z'),
}));

import { syncWithDrive } from '../src/services/driveService.js';
import { getSettings, saveSettings } from '../src/services/settingsService.js';
import {
  getExportPayload,
  importDataFromObject,
  isPayloadNewer,
  getPayloadTimestamp,
} from '../src/services/importExportService.js';

// ── Global browser API stubs ───────────────────────────────────────────────────
const TOKEN_KEY = 'dindin_drive_token';
const validToken = JSON.stringify({
  access_token: 'test-access-token',
  expires_at: Date.now() + 3_600_000,
});

const dispatchedEvents = [];

beforeEach(() => {
  vi.clearAllMocks();
  dispatchedEvents.length = 0;

  // Minimal window stub
  global.window = {
    dispatchEvent: (e) => dispatchedEvents.push(e),
    google: undefined,
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init?.detail ?? null;
    }
  };

  // localStorage stub with valid stored token
  global.localStorage = {
    _store: { [TOKEN_KEY]: validToken },
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  };

  // Default settings: connected with a file ID
  getSettings.mockResolvedValue({
    driveConnected: true,
    driveFileId: 'file-123',
    driveFileName: 'dindin-backup.json',
    lastSyncedAt: null,
  });

  getExportPayload.mockResolvedValue({ records: [], categories: [], commonRecordNames: [], settings: {} });
  getPayloadTimestamp.mockReturnValue('2025-01-01T00:00:00.000Z');
});

// ── Helper: create a mock fetch response ──────────────────────────────────────
function mockFetchSuccess(body = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchError(status, message = '') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => message || String(status),
  });
}

const drivePayload = { records: [{ id: 'r1', updatedAt: '2026-01-01T00:00:00.000Z' }], categories: [], commonRecordNames: [], settings: {} };
const localPayload = { records: [{ id: 'r2', updatedAt: '2025-01-01T00:00:00.000Z' }], categories: [], commonRecordNames: [], settings: {} };

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('syncWithDrive — Drive is newer', () => {
  it('calls importDataFromObject with the Drive payload', async () => {
    mockFetchSuccess(drivePayload);
    isPayloadNewer.mockImplementation((inc) => inc === drivePayload);
    getExportPayload.mockResolvedValue(localPayload);

    await syncWithDrive({ silent: false });

    expect(importDataFromObject).toHaveBeenCalledWith(drivePayload);
  });

  it('dispatches dindin:drive-synced', async () => {
    mockFetchSuccess(drivePayload);
    isPayloadNewer.mockImplementation((inc) => inc === drivePayload);
    getExportPayload.mockResolvedValue(localPayload);

    await syncWithDrive({ silent: false });

    const synced = dispatchedEvents.find((e) => e.type === 'dindin:drive-synced');
    expect(synced).toBeDefined();
    expect(synced.detail.lastSyncedAt).toBeTruthy();
  });

  it('dispatches dindin:reload to refresh the UI', async () => {
    mockFetchSuccess(drivePayload);
    isPayloadNewer.mockImplementation((inc) => inc === drivePayload);
    getExportPayload.mockResolvedValue(localPayload);

    await syncWithDrive({ silent: false });

    expect(dispatchedEvents.some((e) => e.type === 'dindin:reload')).toBe(true);
  });

  it('does NOT push to Drive (no PATCH fetch call)', async () => {
    mockFetchSuccess(drivePayload);
    isPayloadNewer.mockImplementation((inc) => inc === drivePayload);
    getExportPayload.mockResolvedValue(localPayload);

    await syncWithDrive({ silent: false });

    const patchCall = global.fetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patchCall).toBeUndefined();
  });
});

describe('syncWithDrive — local is newer', () => {
  beforeEach(() => {
    mockFetchSuccess(drivePayload);
    // First call: drivePayload is NOT newer; second call: localPayload IS newer
    isPayloadNewer.mockImplementation((inc, loc) => inc === localPayload && loc === drivePayload);
    getExportPayload.mockResolvedValue(localPayload);
  });

  it('does NOT call importDataFromObject (local data is preserved)', async () => {
    await syncWithDrive({ silent: false });
    expect(importDataFromObject).not.toHaveBeenCalled();
  });

  it('pushes local data to Drive via PATCH', async () => {
    await syncWithDrive({ silent: false });

    const patchCall = global.fetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patchCall).toBeDefined();
  });

  it('dispatches dindin:drive-synced', async () => {
    await syncWithDrive({ silent: false });

    const synced = dispatchedEvents.find((e) => e.type === 'dindin:drive-synced');
    expect(synced).toBeDefined();
  });

  it('does NOT dispatch dindin:reload (local data unchanged)', async () => {
    await syncWithDrive({ silent: false });
    expect(dispatchedEvents.some((e) => e.type === 'dindin:reload')).toBe(false);
  });

  it('updates lastSyncedAt', async () => {
    await syncWithDrive({ silent: false });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAt: expect.any(String) }),
    );
  });
});

describe('syncWithDrive — in sync', () => {
  it('dispatches dindin:drive-synced and updates lastSyncedAt without touching data', async () => {
    mockFetchSuccess(drivePayload);
    isPayloadNewer.mockReturnValue(false);
    getExportPayload.mockResolvedValue(localPayload);

    await syncWithDrive({ silent: false });

    expect(importDataFromObject).not.toHaveBeenCalled();
    const patchCall = global.fetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patchCall).toBeUndefined();

    const synced = dispatchedEvents.find((e) => e.type === 'dindin:drive-synced');
    expect(synced).toBeDefined();
    expect(saveSettings).toHaveBeenCalled();
  });
});

describe('syncWithDrive — 404 (Drive file missing)', () => {
  it('dispatches dindin:drive-sync-error and does not import', async () => {
    mockFetchError(404, 'Not Found');

    await syncWithDrive({ silent: false });

    expect(importDataFromObject).not.toHaveBeenCalled();
    const err = dispatchedEvents.find((e) => e.type === 'dindin:drive-sync-error');
    expect(err).toBeDefined();
    expect(err.detail.message).toContain('não encontrado');
  });

  it('does not throw', async () => {
    mockFetchError(404, 'Not Found');
    await expect(syncWithDrive({ silent: false })).resolves.toBeUndefined();
  });
});

describe('syncWithDrive — token expiry (silent)', () => {
  it('dispatches dindin:drive-auth-needed and throws', async () => {
    // Remove stored token so _getValidToken enters the silent-expiry branch
    global.localStorage._store = {};
    global.fetch = vi.fn();

    await expect(syncWithDrive({ silent: true })).rejects.toThrow(/token expirado/i);

    const authNeeded = dispatchedEvents.find((e) => e.type === 'dindin:drive-auth-needed');
    expect(authNeeded).toBeDefined();
  });
});

describe('syncWithDrive — not connected', () => {
  it('returns early when driveConnected is false', async () => {
    getSettings.mockResolvedValue({ driveConnected: false });
    global.fetch = vi.fn();

    await syncWithDrive({ silent: false });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(importDataFromObject).not.toHaveBeenCalled();
  });

  it('returns early when driveFileId is missing', async () => {
    getSettings.mockResolvedValue({ driveConnected: true, driveFileId: null });
    global.fetch = vi.fn();

    await syncWithDrive({ silent: false });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('syncWithDrive — mutex', () => {
  it('skips concurrent sync calls', async () => {
    // Slow first sync: fetch hangs, second call should be ignored
    let resolveFetch;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((r) => { resolveFetch = r; }),
    );
    isPayloadNewer.mockReturnValue(false);

    const first = syncWithDrive({ silent: false });
    const second = syncWithDrive({ silent: false }); // should be skipped

    // Resolve the fetch for first sync
    resolveFetch({ ok: true, json: async () => ({}), text: async () => '{}' });

    await Promise.allSettled([first, second]);

    // fetch should have been called only once (from the first sync)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
