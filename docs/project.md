# THE PROJECT "DINDIN"

* The main objective for this project is to replace a manual Excel table for financial control.
* Data is stored locally in the browser via IndexedDB; users can export/import full snapshots as `.json` files at any time.
* The app runs on desktop and mobile (no build step — served directly as static HTML/JS).
* All visible UI text is in Portuguese-BR; all code identifiers and documentation are in English.

For architecture, folder structure, patterns, and conventions see [`architecture.md`](architecture.md).
For complete service API reference see [`services.md`](services.md).
For UI and screen specifications see [`screens.md`](screens.md).

---

## DATA MODELS

All models are created via factory functions in `src/models/`. Factories auto-generate `id` (UUID) and ISO timestamps. Do not construct model objects manually — always use the factory.

### RecordType

Enum string values. Defined in `src/models/RecordType.js`.

| Value | Meaning |
|---|---|
| `'income'` | Money received (salary, freelance, etc.) |
| `'expense'` | Money spent |

---

### Category

Groups records by purpose (e.g. "Groceries", "Rent"). Defined in `src/models/Category.js`.

Factory: `createCategory({ name, tags, recordType, idealValue })`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated UUID. |
| `name` | `string` | Display name. |
| `tags` | `string[]` | Labels for visual grouping on the main view. |
| `recordType` | `RecordType` | `'income'` or `'expense'`. |
| `idealValue` | `number` | Budgeted amount per month (0 if no budget set). |
| `createdAt` | `string` | ISO timestamp; set once at creation. |
| `updatedAt` | `string` | ISO timestamp; updated on every save. |

---

### Record

Represents a single financial transaction. Defined in `src/models/Record.js`.

Factory: `createRecord({ categoryId, value, name, date, month?, tags?, isRecurring, isInstallment, installmentGroupId, installmentNumber, installmentTotal, registeredInCurrentMonth })`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated UUID. |
| `categoryId` | `string` | FK to `Category.id`. |
| `value` | `string\|number` | Raw formula string (e.g. `"50+7"`) or legacy numeric. Evaluated at display time via `parseFormula()`. |
| `name` | `string` | Place or description of the transaction. |
| `date` | `string` | Format `YYYY-MM-DD`; the actual date the transaction occurred. Defaults to today if omitted. |
| `month` | `string` | Format `YYYY-MM`; derived from `date` by default (`date.slice(0,7)`). May differ from `date` when `registeredInCurrentMonth` is `true`. Indexed in IndexedDB for fast monthly queries. |
| `tags` | `string[]` | Optional labels for the record. Combined with the parent category's tags for display and filtering. Defaults to `[]`. |
| `isRecurring` | `boolean` | When `true`, the record is automatically propagated to the next month when the user closes the current month. |
| `isInstallment` | `boolean` | When `true`, the record belongs to an installment group (parcelado). |
| `installmentGroupId` | `string\|null` | Shared UUID across all records in the same installment purchase. |
| `installmentNumber` | `number\|null` | 1-based index of this installment within the group. |
| `installmentTotal` | `number\|null` | Total number of installments in the group. |
| `registeredInCurrentMonth` | `boolean` | When `true`, the record was intentionally assigned to the month of `createdAt` even though `date` is in a future month. Lets users pre-register a future expense against the current budget. |
| `createdAt` | `string` | ISO timestamp; set once at creation time. |
| `updatedAt` | `string` | ISO timestamp; updated on every save. |

**Mutual exclusion**: `isRecurring` and `isInstallment` cannot both be `true` on the same record.

---

### CommonRecordName

A global list of record name strings used for autocomplete. A name is automatically added after every successful record save. Defined in `src/models/CommonRecordName.js`.

Factory: `createCommonRecordName(name)`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated UUID. |
| `name` | `string` | The autocomplete string. |
| `updatedAt` | `string` | ISO timestamp; set at creation time. |

Names are deduplicated case-insensitively when added via `addCommonRecordName()`.

---

### ProjectSettings

Stores global app configuration. There is a single settings document in the DB. Defined in `src/models/ProjectSettings.js`.

Factory: `defaultSettings()` — returns the default values shown below.

| Field | Type | Default | Description |
|---|---|---|---|
| `period` | `number` | `3` | Number of past months shown in the history view. |
| `currentMonth` | `string\|null` | `null` | Format `YYYY-MM`. Set automatically on the first record save if not already defined. Can also be set manually in the Settings modal. |
| `driveConnected` | `boolean` | `false` | Whether a Google Drive file is linked. |
| `driveFileId` | `string\|null` | `null` | ID of the Drive file used for sync. |
| `driveFileName` | `string\|null` | `null` | Display name of the Drive file. |
| `lastSyncedAt` | `string\|null` | `null` | ISO timestamp of the last successful Drive sync. |

---

### AuditEntry

Internal audit log entry. Not user-editable; created automatically by services when records or categories are created, updated, or deleted. Defined inline in `src/services/auditLogService.js`.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated UUID. |
| `entityType` | `'record'\|'category'` | The type of entity affected. |
| `entityId` | `string` | The `id` of the affected entity. |
| `action` | `'created'\|'updated'\|'deleted'` | What happened. |
| `timestamp` | `string` | ISO timestamp. |
| `snapshot` | `object` | State of the entity after the action. |
| `previousSnapshot` | `object\|null` | State before the action (`null` for `'created'`). |

---

## STORAGE

### IndexedDB

**Database name**: `dindin`  
**Current version**: `5`

All data is persisted in IndexedDB via a thin wrapper in `src/services/db.js`. The wrapper handles version upgrades and exposes `getStore(storeName, mode?)` and `promisify(request)`.

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `categories` | `id` | — | Category documents |
| `records` | `id` | `month`, `categoryId`, `isRecurring`, `installmentGroupId` | Record documents |
| `settings` | `id` | — | Single settings document (key: `'settings'`) |
| `commonRecordNames` | `id` | — | Autocomplete name strings |
| `auditLog` | `id` | `timestamp`, `entityType`, `action` | Audit trail entries |

**Migration history**:
- v3: Added `isRecurring` index on `records`.
- v4: Added `installmentGroupId` index on `records`.
- v5: Backfilled `updatedAt` (set to `createdAt`) on any existing records, categories, and commonRecordNames that predate the field.

### JSON Export / Import

`importExportService.js` provides a full-snapshot export (downloads a `.json` file) and import (full replace — clears all stores except `auditLog`, then inserts from the payload). The payload shape is:

```json
{
  "categories": [...],
  "records": [...],
  "settings": { ... },
  "commonRecordNames": [...]
}
```

### CSV Import

`csvImportService.js` parses a Portuguese-BR formatted CSV (R$ currency, PT-BR month labels) and inserts records through a two-step user-confirmation flow. See `screens.md` for the UI flow.

### Google Drive Sync

`driveService.js` provides bidirectional full-replacement sync via the Google Drive API. The strategy compares max `updatedAt` timestamps between the local payload and the Drive file:

- **Drive newer** → import Drive file to local DB, then reload.
- **Local newer** → push local payload to Drive (PATCH).
- **In sync** → update `lastSyncedAt` only.

Credentials (Client ID, API Key, App ID) are stored in `localStorage`. OAuth access tokens are auto-refreshed. Auto-sync runs on a 60-second interval when Drive is connected.

Custom DOM events dispatched during sync:
| Event | When |
|---|---|
| `dindin:drive-synced` | Sync completed successfully |
| `dindin:reload` | Full page reload needed (after import from Drive) |
| `dindin:drive-sync-error` | Sync failed |
| `dindin:drive-auth-needed` | OAuth token expired (silent mode only) |

## Screens
Screens specifications can be found at [`screens.md`](screens.md).
