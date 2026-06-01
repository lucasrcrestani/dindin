# ARCHITECTURE

This document describes the technical stack, folder structure, state management, service layers, component patterns, and coding conventions for the Dindin project. Read this before implementing any new feature.

---

## TECH STACK

| Concern | Solution |
|---|---|
| Language | Vanilla JavaScript — ES6 modules (`type="module"`) |
| Storage | Browser IndexedDB (via thin `db.js` wrapper) |
| Styling | Plain CSS (`assets/css/`) |
| Build step | **None** — files are served directly as static HTML/JS |
| Testing | [Vitest](https://vitest.dev/) v2, Node environment |
| Dependencies | No runtime dependencies — zero `node_modules` at runtime |

Running the app locally requires only a static file server (e.g. `npx serve .` or VS Code Live Server). Running tests requires `npm install` then `npm test`.

---

## FOLDER STRUCTURE

```
dindin/
├── index.html              Entry point; loads assets/js/app.js as a module
├── package.json            Dev dependencies (vitest only)
├── vitest.config.js        Test config (node environment, tests/**)
├── assets/
│   ├── css/
│   │   ├── main.css        Global styles, layout, typography
│   │   ├── components.css  Modal, card, button, form styles
│   │   └── responsive.css  Media queries / mobile overrides
│   └── images/             Static image assets
├── src/
│   ├── models/             Data model factories (no DB logic)
│   ├── services/           Business logic and DB access
│   ├── components/         UI rendering functions (modals, cards, pages)
│   ├── pages/              Top-level page orchestrators
│   ├── store/              Pub/sub state container
│   └── utils/              Pure utility functions (no side effects)
├── tests/                  Vitest unit tests
└── docs/                   Project documentation
```

### src/models/

Pure factory functions. No imports from `services/` or `store/`. Each factory auto-generates `id` (UUID) and ISO timestamps.

| File | Factory | Creates |
|---|---|---|
| `Category.js` | `createCategory(data)` | Category object |
| `Record.js` | `createRecord(data)` | Record object |
| `CommonRecordName.js` | `createCommonRecordName(name)` | CommonRecordName object |
| `ProjectSettings.js` | `defaultSettings()` | Default settings object |
| `RecordType.js` | — | `RecordType` enum (`INCOME`/`EXPENSE`) |

### src/services/

Three logical tiers:

1. **DB wrapper** — `db.js`: manages the IndexedDB connection, store names, version migrations.
2. **Domain services** — `recordService.js`, `categoryService.js`, `settingsService.js`, `commonRecordNameService.js`, `auditLogService.js`: CRUD and business logic per entity.
3. **Integration services** — `importExportService.js`, `driveService.js`, `csvImportService.js`, `pickerService.js`: cross-domain flows and external APIs.

Full API reference: [`services.md`](services.md).

### src/components/

Each file exports one or more rendering functions. Components are not classes — they are factory functions that create DOM elements or inject HTML strings. Components import from `services/` and `store/` but never directly from other components (except through function arguments).

### src/pages/

Top-level orchestrators that compose multiple components to render a full view. Currently only `mainPage.js` (`renderMain()`).

### src/store/

Single file: `appState.js`. Pub/sub state container. See **State Management** below.

### src/utils/

Pure functions with no side effects and no imports from `services/`, `store/`, or `components/`.

| File | Exports |
|---|---|
| `balanceUtils.js` | Balance computation and status logic |
| `dateUtils.js` | Month key manipulation and formatting helpers |
| `formatters.js` | Currency and date display formatters |
| `formulaUtils.js` | `parseFormula(val)` — safe arithmetic expression parser |
| `idUtils.js` | `generateId()` — wraps `crypto.randomUUID()` |

---

## STATE MANAGEMENT

**File**: `src/store/appState.js`

Simple pub/sub container. No Redux, no framework.

```js
// State shape
{
  settings: ProjectSettings | null,
  categories: Category[],
  records: Record[],
  commonRecordNames: CommonRecordName[],
  currentView: 'main' | 'categories' | 'settings',
}
```

### API

| Function | Description |
|---|---|
| `getState()` | Returns a shallow copy of the current state. |
| `setState(partial)` | Merges `partial` into state and notifies all relevant subscribers. |
| `subscribe(key, fn)` | Subscribes to changes on a specific key. Use `'*'` to receive all changes. Returns an unsubscribe function. |

### Usage pattern

Components read state by calling `getState()` at render time and subscribe to re-render when relevant keys change:

```js
import { getState, subscribe } from '../store/appState.js';

function render() {
  const { categories } = getState();
  // ... build DOM
}
subscribe('categories', render);
render();
```

---

## SERVICE LAYER PATTERNS

### DB wrapper (`db.js`)

All IndexedDB access goes through two helpers:

```js
getStore(storeName, mode = 'readonly')  // → IDBObjectStore
promisify(idbRequest)                   // → Promise<result>
```

Always call `initDB()` once at app startup (in `app.js`) before any service is used.

### Domain services

All service functions are `async` and return Promises. They use `getStore()` + `promisify()` directly. Example pattern:

```js
async function getAllRecords() {
  return promisify(getStore(STORES.RECORDS).getAll());
}

async function saveRecord(data) {
  const record = data.id
    ? { ...data, updatedAt: new Date().toISOString() }  // update: preserve createdAt
    : createRecord(data);                                // create: factory generates id + timestamps
  await promisify(getStore(STORES.RECORDS, 'readwrite').put(record));
  return record;
}
```

**Rule**: when a `data.id` is present, it is an update — preserve `createdAt`, refresh `updatedAt`. When no `id`, it is a create — delegate to the model factory.

---

## COMPONENT PATTERNS

### Modal overlay pattern

Modals are appended to `#modals` div in `index.html`. They are created, shown, and removed entirely via JS:

```js
const overlay = document.createElement('div');
overlay.className = 'modal-overlay';
overlay.innerHTML = `<div class="modal">...</div>`;
document.getElementById('modals').appendChild(overlay);
// Animate in:
requestAnimationFrame(() => overlay.classList.add('visible'));
// Close:
overlay.remove();
```

### XSS prevention

Any user-supplied string rendered as HTML must be escaped. Two helpers are used inline in component files:

```js
function escapeHtml(str) { /* replaces &, <, >, ", ' */ }
function escapeAttr(str) { /* for attribute contexts */ }
```

Never interpolate raw user data directly into HTML strings.

### Form binding

Components build an HTML string via template literals, append it to the DOM, then bind events with `querySelector`:

```js
overlay.innerHTML = `<form>...</form>`;
overlay.querySelector('form').addEventListener('submit', handler);
```

### Re-rendering

After any data mutation, components call `renderMain()` (or the relevant render function) to rebuild the view from scratch. There is no virtual DOM or partial update mechanism.

---

## MODEL FACTORY PATTERN

Always use model factories to create new objects. Never construct `{ id: ..., createdAt: ... }` manually.

```js
// Correct
const record = createRecord({ categoryId, value, name, date });

// Wrong — missing auto-generated fields
const record = { id: generateId(), categoryId, value, name, date };
```

The factory is also the canonical place to set defaults (`isRecurring: false`, `installmentGroupId: null`, etc.).

---

## EVENT-DRIVEN SYNC

Google Drive sync communicates results to the UI via custom DOM events dispatched on `window`:

| Event name | When dispatched | Listener |
|---|---|---|
| `dindin:drive-synced` | Sync completed successfully | `driveSyncButton.js` |
| `dindin:reload` | Local data was replaced (Drive was newer) | `app.js` → `location.reload()` |
| `dindin:drive-sync-error` | Sync failed | `driveSyncButton.js` |
| `dindin:drive-auth-needed` | OAuth token expired (silent sync only) | `driveSyncButton.js` |

Dispatch example:
```js
window.dispatchEvent(new CustomEvent('dindin:drive-synced', { detail: { lastSyncedAt } }));
```

---

## CODING CONVENTIONS

| Convention | Rule |
|---|---|
| Language | All UI-visible strings in **Portuguese-BR**. All code (variable names, function names, comments, docs) in **English**. |
| Modules | ES6 `import`/`export` only. No CommonJS. |
| Async | `async/await` throughout. No raw `.then()` chains. |
| IDs | Always generated via `generateId()` (`crypto.randomUUID()`). Never hardcoded. |
| Timestamps | Always ISO strings (`new Date().toISOString()`). Never `Date.now()` integers for display. |
| HTML escaping | All user-supplied content rendered in HTML must pass through `escapeHtml()` or `escapeAttr()`. |
| No build | Do not introduce a bundler, transpiler, or any build step. |
| No frameworks | Do not add React, Vue, or similar. UI is vanilla JS + DOM manipulation. |
| No global state mutation | All state changes go through `setState()`. Never modify the object returned by `getState()`. |
| Service purity | Utility functions in `src/utils/` must remain pure (no side effects, no imports from services/store). |
| Tests | Tests live in `tests/` and use Vitest. Mock `src/services/db.js` to avoid real IndexedDB in tests. |

---

## TESTING APPROACH

Tests are in `tests/*.test.js` and run with `npm test` (Vitest in Node environment).

**Mocking strategy**: `db.js` is mocked with a Map-based in-memory store. Services are tested via their public API with the mock DB injected via `vi.mock('../../src/services/db.js', ...)`.

**What to test**:
- Model factories: field defaults, auto-generated fields.
- Service functions: CRUD behavior, conditional logic, edge cases.
- Pure utility functions: formula parsing, balance computation, timestamp comparison.

**What not to test**:
- DOM rendering (components are not unit-tested).
- IndexedDB internals.
