/**
 * Unit tests for pure sync helper functions in importExportService.js.
 * These functions have no DB or browser dependencies.
 */
import { describe, it, expect } from 'vitest';
import { isPayloadNewer, arePayloadsInSync, getPayloadTimestamp } from '../src/services/importExportService.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeRecord(updatedAt, createdAt = updatedAt) {
  return { id: 'r1', updatedAt, createdAt };
}

function makePayload(records = [], settings = {}) {
  return { records, categories: [], commonRecordNames: [], settings };
}

// ── getPayloadTimestamp ───────────────────────────────────────────────────────
describe('getPayloadTimestamp', () => {
  it('returns null for empty payload', () => {
    expect(getPayloadTimestamp(makePayload())).toBeNull();
  });

  it('returns max updatedAt across records', () => {
    const payload = makePayload([
      makeRecord('2025-01-01T00:00:00.000Z'),
      makeRecord('2025-06-01T00:00:00.000Z'),
      makeRecord('2025-03-01T00:00:00.000Z'),
    ]);
    expect(getPayloadTimestamp(payload)).toBe('2025-06-01T00:00:00.000Z');
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    const payload = makePayload([
      { id: 'r1', createdAt: '2025-05-01T00:00:00.000Z' },
      { id: 'r2', createdAt: '2025-04-01T00:00:00.000Z' },
    ]);
    expect(getPayloadTimestamp(payload)).toBe('2025-05-01T00:00:00.000Z');
  });

  it('prefers updatedAt over createdAt when both present', () => {
    const payload = makePayload([
      { id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2025-09-01T00:00:00.000Z' },
    ]);
    expect(getPayloadTimestamp(payload)).toBe('2025-09-01T00:00:00.000Z');
  });

  it('handles payload with undefined records field', () => {
    expect(getPayloadTimestamp({})).toBeNull();
  });
});

// ── isPayloadNewer ─────────────────────────────────────────────────────────────
describe('isPayloadNewer', () => {
  it('returns true when incoming has newer updatedAt', () => {
    const incoming = makePayload([makeRecord('2025-06-01T00:00:00.000Z')]);
    const local    = makePayload([makeRecord('2025-01-01T00:00:00.000Z')]);
    expect(isPayloadNewer(incoming, local)).toBe(true);
  });

  it('returns false when local is newer', () => {
    const incoming = makePayload([makeRecord('2025-01-01T00:00:00.000Z')]);
    const local    = makePayload([makeRecord('2025-06-01T00:00:00.000Z')]);
    expect(isPayloadNewer(incoming, local)).toBe(false);
  });

  it('returns false when timestamps are equal', () => {
    const ts = '2025-06-01T00:00:00.000Z';
    const incoming = makePayload([makeRecord(ts)]);
    const local    = makePayload([makeRecord(ts)]);
    expect(isPayloadNewer(incoming, local)).toBe(false);
  });

  it('returns false when incoming has no records', () => {
    const local = makePayload([makeRecord('2025-01-01T00:00:00.000Z')]);
    expect(isPayloadNewer(makePayload(), local)).toBe(false);
  });

  it('returns true when local has no records but incoming does', () => {
    const incoming = makePayload([makeRecord('2025-01-01T00:00:00.000Z')]);
    expect(isPayloadNewer(incoming, makePayload())).toBe(true);
  });

  it('returns false when both payloads have no records', () => {
    expect(isPayloadNewer(makePayload(), makePayload())).toBe(false);
  });

  it('detects edits via updatedAt even when createdAt is the same', () => {
    const createdAt = '2025-01-01T00:00:00.000Z';
    const incoming = makePayload([{ id: 'r1', createdAt, updatedAt: '2025-06-01T00:00:00.000Z' }]);
    const local    = makePayload([{ id: 'r1', createdAt, updatedAt: createdAt }]);
    expect(isPayloadNewer(incoming, local)).toBe(true);
  });

  it('handles missing updatedAt by falling back to createdAt', () => {
    const incoming = makePayload([{ id: 'r1', createdAt: '2025-06-01T00:00:00.000Z' }]);
    const local    = makePayload([{ id: 'r1', createdAt: '2025-01-01T00:00:00.000Z' }]);
    expect(isPayloadNewer(incoming, local)).toBe(true);
  });
});

// ── arePayloadsInSync ─────────────────────────────────────────────────────────
describe('arePayloadsInSync', () => {
  it('returns true when both have the same max timestamp', () => {
    const ts = '2025-06-01T00:00:00.000Z';
    const a = makePayload([makeRecord(ts)]);
    const b = makePayload([makeRecord(ts)]);
    expect(arePayloadsInSync(a, b)).toBe(true);
  });

  it('returns false when timestamps differ', () => {
    const a = makePayload([makeRecord('2025-06-01T00:00:00.000Z')]);
    const b = makePayload([makeRecord('2025-01-01T00:00:00.000Z')]);
    expect(arePayloadsInSync(a, b)).toBe(false);
  });

  it('returns true when both payloads are empty', () => {
    expect(arePayloadsInSync(makePayload(), makePayload())).toBe(true);
  });

  it('returns false when one is empty and the other is not', () => {
    const withRecord = makePayload([makeRecord('2025-06-01T00:00:00.000Z')]);
    expect(arePayloadsInSync(withRecord, makePayload())).toBe(false);
    expect(arePayloadsInSync(makePayload(), withRecord)).toBe(false);
  });
});
