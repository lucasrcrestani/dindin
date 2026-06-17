# SERVICE API REFERENCE

This document is the complete reference for all service modules in `src/services/`. Every function is async unless marked **(sync)**. All DB-mutating functions perform a full replace (not a merge) unless noted otherwise.

See [`architecture.md`](architecture.md) for the layered service architecture overview.

---

## db.js

Low-level IndexedDB wrapper. All other services import from this module; application code never uses IndexedDB directly.

**Constants**

```js
STORES.CATEGORIES        // 'categories'
STORES.RECORDS           // 'records'
STORES.SETTINGS          // 'settings'
STORES.COMMON_RECORD_NAMES // 'commonRecordNames'
STORES.AUDIT_LOG         // 'auditLog'
```

**Functions**

| Signature | Returns | Description |
|---|---|---|
| `initDB()` | `Promise<IDBDatabase>` | Opens (and migrates) the IndexedDB database. Must be called once at app startup before any service is used. Caches the connection; safe to call multiple times. |
| `getStore(name, mode?)` | `IDBObjectStore` | Returns an object store for the given name. `mode` defaults to `'readonly'`; use `'readwrite'` for mutations. Requires `initDB()` to have been called. |
| `promisify(request)` | `Promise<result>` | Wraps an `IDBRequest` in a Promise. Used by all service functions to bridge the callback-based IDB API. |

---

## recordService.js

Domain service for `Record` documents.

| Signature | Returns | Description |
|---|---|---|
| `getAllRecords()` | `Promise<Record[]>` | Returns all records across all months. |
| `getRecordsByMonth(month)` | `Promise<Record[]>` | Returns all records with `record.month === month` (YYYY-MM). Uses the `month` index. |
| `getRecordsByCategory(categoryId)` | `Promise<Record[]>` | Returns all records for a category across all months. Uses the `categoryId` index. |
| `getRecurringRecordsByMonth(month)` | `Promise<Record[]>` | Returns records for `month` where `isRecurring === true`. |
| `getInstallmentsByMonth(month)` | `Promise<Record[]>` | Returns records for `month` where `isInstallment === true`. |
| `getInstallmentsByGroupId(groupId)` | `Promise<Record[]>` | Returns all records in an installment group, sorted by `installmentNumber` ascending. |
| `getAllMonthsWithRecords()` | `Promise<string[]>` | Returns a deduplicated sorted array of all `month` keys that have at least one record. |
| `getAllRecordTags()` | `Promise<string[]>` | Returns all unique record tags across the DB, sorted ascending. Used by tag autocomplete in record forms. |
| `saveRecord(data)` | `Promise<Record>` | **Create or update.** If `data.id` is present, updates `updatedAt` and persists. If no `id`, calls `createRecord(data)` to generate a new record. Returns the saved record. |
| `deleteRecord(id)` | `Promise<void>` | Deletes the record with the given id. |
| `deleteRecordsByCategory(categoryId)` | `Promise<void>` | Deletes all records belonging to a category. Used when deleting a category. |
| `saveInstallmentGroup(data, installmentCount)` | `Promise<Record[]>` | Creates `installmentCount` installment records, one per month starting from `data.date`. All share the same auto-generated `installmentGroupId`. If `data.registeredInCurrentMonth` is true, the first installment's `month` is overridden to `data.currentMonthOverride`. Returns all created records. |
| `quitarInstallments(groupId, currentMonth)` | `Promise<void>` | Moves all future installment records (those with `month > currentMonth`) to `currentMonth`. Updates their `date` to the same day number but in `currentMonth`. |
| `updateInstallmentFromCurrent(record)` | `Promise<void>` | Propagates `name`, `value`, and `categoryId` changes from the given record to all records in the same installment group with `installmentNumber >= record.installmentNumber`. Used when editing an installment. |

**`saveInstallmentGroup` data shape:**

```js
{
  categoryId: string,
  value: string,
  name: string,
  date: string,            // YYYY-MM-DD (first installment date)
  tags?: string[],
  registeredInCurrentMonth?: boolean,
  currentMonthOverride?: string,  // YYYY-MM (if registeredInCurrentMonth is true)
}
```

---

## categoryService.js

Domain service for `Category` documents.

| Signature | Returns | Description |
|---|---|---|
| `getAllCategories()` | `Promise<Category[]>` | Returns all categories. |
| `getCategoryById(id)` | `Promise<Category \| undefined>` | Returns a single category by id. |
| `saveCategory(data)` | `Promise<Category>` | **Create or update.** If `data.id` is present, updates `updatedAt` and persists. Otherwise calls `createCategory(data)`. Returns the saved category. |
| `deleteCategory(id)` | `Promise<void>` | Deletes the category by id. Call `deleteRecordsByCategory(id)` separately to remove associated records. |
| `migrateCategoryCreatedAt()` | `Promise<void>` | **One-time migration.** Writes a `createdAt` to any category that lacks it, inferring the value from the oldest record in that category (or now if no records exist). Safe to call repeatedly — no-ops if all categories already have `createdAt`. |

---

## settingsService.js

Domain service for the single `ProjectSettings` document.

The settings document is stored under the fixed key `'main'` in the `settings` store.

| Signature | Returns | Description |
|---|---|---|
| `getSettings()` | `Promise<ProjectSettings>` | Returns stored settings merged with defaults. Never returns null — falls back to `defaultSettings()` if nothing is stored. |
| `saveSettings(settings)` | `Promise<ProjectSettings>` | Persists the settings object (merges with the fixed key `'main'`). Returns the saved object. |

---

## commonRecordNameService.js

Domain service for `CommonRecordName` autocomplete entries.

| Signature | Returns | Description |
|---|---|---|
| `getAllCommonRecordNames()` | `Promise<CommonRecordName[]>` | Returns all autocomplete entries. |
| `addCommonRecordName(name)` | `Promise<CommonRecordName \| null>` | Adds the name if it does not already exist (case-insensitive comparison). Returns the created entry, or `null` if it was a duplicate. |
| `deleteCommonRecordName(id)` | `Promise<void>` | Deletes an entry by id. |

---

## importExportService.js

Integration service for full-snapshot import/export and payload comparison helpers used by Drive sync.

| Signature | Returns | Description |
|---|---|---|
| `getExportPayload()` | `Promise<object>` | Builds and returns a plain object snapshot of all data: `{ categories, records, settings, commonRecordNames }`. Does **not** trigger a download. |
| `exportData()` | `Promise<void>` | Calls `getExportPayload()` and triggers a browser file download of the JSON snapshot. Filename: `dindin-{currentMonth}.json`. |
| `importData(file)` | `Promise<void>` | Reads a `File` object, parses it as JSON, and calls `importDataFromObject()`. Throws `Error('Arquivo JSON inválido.')` on parse failure. |
| `importDataFromObject(payload)` | `Promise<void>` | **Full replace.** Clears `categories`, `records`, `settings`, and `commonRecordNames` stores, then inserts all items from the payload. The `auditLog` store is NOT cleared. Existing IDs are preserved. |
| `parseImportFile(file)` | `Promise<{ payload, isNewer }>` | Parses a file and checks whether it is newer than the local DB. Returns `{ payload: object, isNewer: boolean }`. Use this before calling `importDataFromObject()` when you need to warn the user about overwriting newer local data. |
| `isPayloadNewer(incoming, local)` | `boolean` **(sync)** | Returns `true` if `incoming` has records with a higher max `updatedAt` than `local`. Used by Drive sync to decide direction. |
| `arePayloadsInSync(a, b)` | `boolean` **(sync)** | Returns `true` if both payloads share the same max timestamp (neither is newer). |
| `getPayloadTimestamp(payload)` | `string \| null` **(sync)** | Returns the max `updatedAt` (falling back to `createdAt`) across all records in the payload, or `null` if there are no records. |

**Timestamp comparison rule**: All three comparison functions use `_getMaxTimestamp()` internally, which returns the maximum `updatedAt` (falling back to `createdAt`) across all records. An empty payload has timestamp `null`, which is considered older than any non-empty payload.

---

## driveService.js

Integration service for Google Drive sync. Uses the Google Identity Services (GIS) OAuth library and the Drive REST API v3.

### Credential helpers

| Signature | Returns | Description |
|---|---|---|
| `getCredentials()` | `object \| null` **(sync)** | Returns `{ clientId, apiKey, appId }` from `localStorage`, or `null` if not set. |
| `hasCredentials()` | `boolean` **(sync)** | Returns `true` if all three credential fields are stored. |
| `saveCredentials({ clientId, apiKey, appId })` | `void` **(sync)** | Saves credentials to `localStorage`. |
| `clearCredentials()` | `void` **(sync)** | Removes credentials from `localStorage`. |

### Auth helpers

| Signature | Returns | Description |
|---|---|---|
| `initGoogleAuth()` | `void` **(sync)** | Initialises the GIS token client using stored credentials. Must be called once after the GIS library loads. |
| `signIn()` | `Promise<string>` | Triggers the OAuth consent screen and returns an access token. Use for first-time sign-in. |
| `signOut()` | `Promise<void>` | Revokes the token, clears local token state, stops auto-sync, and resets Drive fields in settings (`driveConnected`, `driveFileId`, `driveFileName`, `lastSyncedAt`). |
| `getStoredToken()` | `string \| null` **(sync)** | Returns the cached access token if still valid (not expired), otherwise `null`. |

### Drive REST helpers

| Signature | Returns | Description |
|---|---|---|
| `downloadFile(fileId, opts?)` | `Promise<object>` | Downloads a Drive file by ID and returns its parsed JSON content. `opts.silent` controls token refresh behavior (see `_getValidToken`). |
| `uploadFile(fileId, fileName, payload, opts?)` | `Promise<void>` | Updates an existing Drive file with a new JSON payload (multipart PATCH). |
| `createFile(name, payload)` | `Promise<object>` | Creates a new Drive file and returns its metadata (`{ id, name, ... }`). |

### Sync

| Signature | Returns | Description |
|---|---|---|
| `syncWithDrive(opts?)` | `Promise<void>` | **Bidirectional full-replacement sync.** Downloads the Drive file, compares max timestamps, then: imports from Drive if Drive is newer; pushes local data if local is newer; or only updates `lastSyncedAt` if in sync. Dispatches custom DOM events on `window` to report the outcome (see below). Is a no-op if another sync is already in progress. `opts.silent = true` (default) suppresses the OAuth popup and dispatches `dindin:drive-auth-needed` instead on token expiry. |
| `startAutoSync()` | `void` **(sync)** | Starts a 60-second interval that calls `syncWithDrive({ silent: true })`. |
| `stopAutoSync()` | `void` **(sync)** | Clears the auto-sync interval. |

**Custom DOM events dispatched by `syncWithDrive()`:**

| Event | `detail` | When |
|---|---|---|
| `dindin:drive-synced` | `{ lastSyncedAt: string }` | Sync completed (any direction). |
| `dindin:reload` | — | Local data was replaced by Drive data; caller should `location.reload()`. |
| `dindin:drive-sync-error` | `{ message: string }` | Sync failed with an error. |
| `dindin:drive-auth-needed` | — | Token expired and `silent = true`; user must manually trigger sync. |

---

## csvImportService.js

Integration service for importing records from a Portuguese-BR formatted CSV file.

### Types

```js
// ParsedCSV — the result of parseCSV()
{
  months: string[],               // YYYY-MM keys found in the CSV
  categories: ParsedCategory[],
}

// ParsedCategory
{
  name: string,
  tags: string[],
  idealValue: number,
  recordType: RecordType,         // inferred from position in CSV (before/after "Total das Despesas")
  recordsByMonth: Map<string, number>,  // YYYY-MM → total value
}

// Mapping — user's decision for one ParsedCategory
{
  parsedCategory: ParsedCategory,
  action: 'create' | 'mapTo' | 'skip',
  targetCategoryId?: string,      // only when action === 'mapTo'
}
```

| Signature | Returns | Description |
|---|---|---|
| `parseCSV(text)` | `ParsedCSV` **(sync)** | Parses a CSV string. Handles PT-BR month labels (`jan.-25` → `2025-01`), Brazilian currency (`R$ 1.234,56`), tag headers, and the `"Total das Despesas"` marker that separates expense from income sections. |
| `executeCSVImport(mappings)` | `Promise<void>` | Executes the import based on the user-provided mappings array. Categories with `action: 'create'` are created; records are inserted into the target category (created or existing). If `currentMonth` is not set, defaults to the latest month in the CSV. Skips categories with `action: 'skip'`. |

---

## auditLogService.js

Domain service for the audit log. Entries are written automatically by other services; they are not user-editable.

### Types

```js
EntityType  = 'record' | 'category'
AuditAction = 'created' | 'updated' | 'deleted'
```

| Signature | Returns | Description |
|---|---|---|
| `addAuditEntry({ entityType, entityId, action, snapshot, previousSnapshot? })` | `Promise<AuditEntry \| null>` | Writes a new audit entry. `previousSnapshot` defaults to `null` (for `'created'` actions). Returns `null` silently if the audit log store is not available (e.g. during tests without the store). |
| `getAllAuditEntries()` | `Promise<AuditEntry[]>` | Returns all entries sorted by `timestamp` descending (newest first). Returns `[]` silently on error. |
| `clearAuditLog()` | `Promise<void>` | Deletes all entries from the store. |

---

## pickerService.js

Integration service wrapping the Google Picker API. Used to let the user select a Drive file to sync with.

| Signature | Returns | Description |
|---|---|---|
| `loadPickerApi()` | `Promise<void>` | Loads the Google Picker API via `gapi.load('picker', ...)`. |
| `openFilePicker(token)` | `Promise<{ id: string, name: string }>` | Shows the Google Picker UI and resolves with the selected file's `{ id, name }`. Requires a valid OAuth access token. |
