# THE PROJECT "DINDIN"
* The main objective for this project is to replace my manual excel table for financial control.
* The project should store the data locally in the browser, however the user should be able to load/save the data .json files whenever they want.
* The project can be accessed in desktop or mobile.
* All visible texts are in Portuguese-BR; code is in English.

## DATA STRUCTURE

### RecordType
Enum: `'income'` | `'expense'`.

### Category
Groups records by purpose.
Fields:
* `id` — generated UUID string.
* `name` — string.
* `tags` — list of strings, used to group categories visually.
* `recordType` — RecordType enum.
* `idealValue` — number; the user's budgeted amount for that category per month.

### CommonRecordsName
Global list of record name strings used for autocomplete while the user types a record name. A name is automatically added after every successful record save.

### Record
Fields:
* `id` — generated UUID string.
* `categoryId` — FK to Category.
* `value` — number.
* `name` — place or description of the specific record.
* `date` — string, format `YYYY-MM-DD`.
* `month` — string, format `YYYY-MM`; derived from `date`; indexed in IndexedDB for fast queries.
* `createdAt` — ISO string.

### ProjectSettings
Stores general app settings:
* `period` — integer; number of past months shown in the history view.
* `currentMonth` — string `YYYY-MM` or `null`; set automatically on first record save if not defined.

## Storage
All data is persisted in **IndexedDB** (via a thin `db.js` wrapper). Secondary indexes exist on `record.month` and `record.categoryId` for efficient filtered queries.

The user can also export/import data as a `.json` file (full snapshot of categories, records, settings, and common record names) and import records from a `.csv` file.

## Screens
Screens specifications can be found at `screens.md`
