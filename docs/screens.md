# SCREENS

This document describes every screen, modal, and UI component in the app. All UI text is in Portuguese-BR. The app is a single-page application — navigation is done by rendering/removing components from the DOM.

---

## MAIN VIEW

The main view content depends on the data stored in the browser:

* **No categories** → shows the Empty State.
* **Has categories** → shows the General Balance, Recurring Records Card, Installment Records Card, and the bottom action bar.

---

## EMPTY STATE

Shown when no categories exist.

* **Criar Categoria** button → opens the Add Category modal.
* **Carregar JSON** button → opens a file picker; loads a `.json` backup. If the incoming file is older than the local data the user is warned and asked to confirm before proceeding.

---

## GENERAL BALANCE

Shows the balance summary for `currentMonth`.

* **Month label** — formatted name of `currentMonth` (e.g. "maio de 2026").
* **Saldo** — difference between total income and total expenses for the month.
* **Receitas** — sum of all income records for the month vs. idealValue of income categories.
* **Despesas** — sum of all expense records for the month vs. total idealValue of expense categories.
* **Status color** (applied to the Saldo value):
  * Green — total expenses below 75% of total idealValue.
  * Yellow — total expenses 75–99% of total idealValue.
  * Red — total expenses ≥ 100% of total idealValue.

**All expense categories are always shown**, even those with zero records in the month (displayed as R$ 0,00, status green).

### Category Sections

Categories are grouped into three sections based on their status:

| Section | Portuguese label | Condition |
|---|---|---|
| BAD | Ultrapassados | Expenses ≥ 100% of idealValue (red) |
| WATCHOUT | Atenção | Expenses 75–99% of idealValue (yellow) |
| NO CONTROLE | No controle | Expenses < 75% of idealValue (green) |

Income categories follow reversed logic: green when actual ≥ idealValue, yellow/red when below.

### Category Card

Each category is displayed as a card showing:

* Category name and tags.
* Actual value vs. ideal value (formatted as currency).
* Historical average (average of past months in the configured period).
* Status badge (color-coded).
* Expandable history: click to reveal a month-by-month breakdown.

Clicking any category card opens the **Category Detail modal** for that category and the current month.

### Tag Filter Bar

Displayed above the category sections when at least one tag exists (across categories or their records for the current month).

* Shows all unique tags as clickable chips.
* Clicking a chip filters the category cards: only cards whose **effective tags** include the selected tag are shown. A card's effective tags = the category's own `tags` ∪ the `tags` of all its records in the current month.
* Clicking an active chip deactivates the filter (shows all cards again).
* Sections with no visible cards after filtering are hidden automatically.

### Bottom Buttons

* **VER HISTÓRICO** — opens the History modal.
* **ENCERRAR MÊS** — initiates the month-closing flow (see below).

---

## RECURRING RECORDS CARD

Shown above the bottom buttons in the main view when there are recurring records in `currentMonth`.

* Records are split into two blocks: **Despesas** (expenses) first, then **Receitas** (incomes). A block is hidden when it has no records.
* Each block displays its records: type icon (↑ expense / ↓ income), record name, category name, value.
* Each block has a subtotal row at the bottom ("Total Despesas" / "Total Receitas").
* Read-only; no edit or delete actions here (use the Category Detail modal for edits).

---

## INSTALLMENT RECORDS CARD

Shown above the bottom buttons in the main view when there are installment records in `currentMonth`.

* Records are split into two blocks: **Despesas** (expenses) first, then **Receitas** (incomes). A block is hidden when it has no records.
* Each block displays its records: type icon, record name, category name, installment badge ("Parcela N/T"), value.
* Each block has a subtotal row at the bottom ("Total Despesas" / "Total Receitas").
* **Editar** button per record — opens the Record modal pre-filled. Saving propagates name/value/category changes to all future installments in the same group.
* **Quitar** button — shown once per installment group, on the first installment. Moves all remaining future installments to `currentMonth`, effectively paying them off early.

---

## HISTORY MODAL

Opens from the **VER HISTÓRICO** button.

* Lists past months grouped by year, newest first.
* Month range is determined by `settings.period` (number of past months) relative to `currentMonth`.
* Selecting a month shows a **read-only** General Balance for that month.
  * Same layout as the main General Balance but no action buttons.
  * Category cards are clickable → opens Category Detail modal for that month (read-only if in past month).
* **Back** button returns to the month list.

---

## CATEGORY DETAIL MODAL (Visão Detalhada)

Opened by clicking any category card (in the main view or history modal).

* Shows all records for the category in the inspected month, sorted by date descending.
* **Total sum** at the bottom.
* **Empty state message** when no records exist.
* **Tags** — each record displays its effective tags: the union of the parent category's tags and the record's own `tags` field, shown as badge chips below the record row.
* **Edit button (✏️)** per record — opens the Record modal pre-filled; saves in-place.
* **Delete button (✕)** per record — asks for confirmation before removing.
* **Adicionar Lançamento** button — opens the Record modal with the category pre-selected.
* Works for both the current month and historical months. In historical months the "Adicionar Lançamento" button still allows adding records (they are saved with that historical month).

---

## RECORD MODAL (Novo / Editar Lançamento)

Used for both creating and editing a record. Title changes to "Editar Lançamento" when editing.

### Fields

| Field | UI label | Notes |
|---|---|---|
| Category | Categoria | Search bar: user types to filter categories; results are grouped by Despesas / Receitas in a dropdown. Pre-filled when opened from a Category Detail. |
| Name/place | Nome / Local | Text input with autocomplete from `CommonRecordsName`. |
| Date | Data | Date picker; defaults to today. |
| Value | Valor | Accepts a formula string (e.g. `50+7`, `120/3`). Both `.` and `,` are valid decimal separators. Evaluated via `parseFormula()` before saving. |
| Tags | Tags | Tag input widget (same pattern as Category tags). Comma, Enter, or Tab separates tags. Backspace removes the last tag. Pre-filled when editing. Saved as `record.tags`. |
| Recurring | Recorrente | Checkbox. Mutually exclusive with Parcelado. |
| Installment | Parcelado | Checkbox + number-of-installments input. Mutually exclusive with Recorrente. |

### Future-date warning

If the selected date is in a future month (after `currentMonth`), a warning is displayed and the user is offered the option to register the record against `currentMonth` instead (`registeredInCurrentMonth = true`). If accepted, `record.month` is set to `currentMonth` even though `record.date` is in the future.

### Installment creation

When Parcelado is checked, the user enters the total number of installments. On save, `saveInstallmentGroup()` creates one record per installment, each one month apart, sharing the same `installmentGroupId`.

### On save

* Formula is validated before saving; an error is shown if invalid.
* Record name is added to `CommonRecordsName` (deduplicated case-insensitively).
* If `currentMonth` is not yet set, it is set to the record's month.

---

## CATEGORY MODAL (Nova / Editar Categoria)

Used for both creating and editing a category.

| Field | UI label | Notes |
|---|---|---|
| Name | Nome | Text input. |
| Type | Tipo | Radio: Despesa / Receita. |
| Budget | Valor Ideal | Currency input (R$). |
| Tags | Tags | Comma-separated text; split into an array on save. |

---

## CATEGORY MANAGEMENT VIEW

Full-page list of all categories (replaces the main view).

* Shows type, idealValue, and tags per category.
* **Edit** — opens the Category modal pre-filled.
* **Delete** — asks for confirmation, then removes the category and all its records (`deleteRecordsByCategory()`).
* Back button returns to the main view.

---

## SETTINGS MODAL

| Section | Control | Behavior |
|---|---|---|
| General | Meses no histórico | Controls `settings.period` (integer). |
| General | Mês atual | Allows manually setting `currentMonth` (YYYY-MM). |
| Data | Exportar JSON | Downloads a full `.json` snapshot via `exportData()`. |
| Data | Importar JSON | Opens a file picker; loads a `.json` snapshot via `importData()`. |
| Data | Importar CSV | Opens the CSV Import modal (two-step flow). |
| Drive | (see below) | Google Drive section. |

### Google Drive Sub-section

**When not connected:**
* **Conectar ao Google Drive** button → opens the Drive Credentials modal to enter API credentials.

**When connected:**
* Shows the linked Drive file name and last sync timestamp.
* **Sincronizar agora** button → triggers `syncWithDrive()`.
* **Trocar arquivo** button → opens a Google Picker to select a different Drive file.
* **Desconectar** button → calls `signOut()` and clears `driveConnected` from settings.

---

## DRIVE CREDENTIALS MODAL

Shown when the user first connects to Google Drive.

Fields:

| Field | Description |
|---|---|
| Client ID | Google OAuth 2.0 client ID. |
| API Key | Google API key. |
| App ID | Google Cloud project (app) ID. |

All fields are required. On confirm, credentials are saved to `localStorage` via `saveCredentials()`. The modal resolves a promise so the caller (`settingsModal.js`) can proceed with `initGoogleAuth()`.

---

## CSV IMPORT MODAL

Triggered from the Settings modal. Two-step flow.

### Step 1 — Category Mapping

A table with one row per category found in the CSV.

| Column | Description |
|---|---|
| Category name | From the CSV header. |
| Tags | Detected tag labels. |
| Ideal value | Detected budget amount. |
| Action | Select: "Criar nova" / "Unir com existente" / "Ignorar". |

* When "Unir com existente" is selected, a second select appears listing existing categories of the same type.
* Exact name matches are pre-selected automatically.
* A **warning banner** is shown if any months in the CSV fall outside the visible range defined by `currentMonth + period` (data would be imported but not visible in the history view without adjusting settings).

### Step 2 — Preview

* A table with months as rows and mapped categories as columns.
* Each cell shows the total value for that month/category combination.
* **Confirmar** executes the import via `executeCSVImport()`.
* **Cancelar** returns to Step 1.

On confirm:
* Categories with action "Criar nova" are created.
* Records are inserted into their target categories.
* If `currentMonth` is not yet set, it defaults to the latest month found in the CSV.

---

## RECURRING CONFIRM MODAL

Shown as part of the **ENCERRAR MÊS** (month closing) flow, when recurring records exist.

* Lists all recurring records from `currentMonth`.
* Each row is **editable**: the user can change the name and value before confirming (useful for adjusting amounts for the next month).
* **Remove** button per row — excludes that record from the next month's propagation.
* **Confirmar** — validates all value formulas, creates the records for the next month, advances `currentMonth`, and re-renders the main view.
* **Cancelar** — aborts month closing; `currentMonth` is not changed.

---

## AUDIT LOG PAGE

Accessible from the settings or menu (full-page view replacing the main view).

* Shows a chronological history of all record and category changes (created, updated, deleted).
* Entries are grouped by date: **Hoje**, **Ontem**, or a formatted date label.
* **Filter tabs**: All / Lançamentos / Categorias.
* Each entry shows: action type, entity name (or category name for records), and timestamp.
* **Limpar histórico** button — clears all audit entries after confirmation.

---

## FLOATING BUTTON (+)

Floating action button (FAB) always visible over the main view.

Click → opens an action sheet overlay with four options:

* **Novo Lançamento** — opens the Record modal (no pre-selected category).
* **Lançamentos em Massa** — navigates to the Bulk Add page.
* **Nova Categoria** — opens the Category modal.
* **Gerenciar Categorias** — navigates to the Category Management view.

---

## BULK ADD PAGE

Full-page view (replaces the main view) for adding multiple records at once.

* Entry point: **Lançamentos em Massa** option in the Floating Button action sheet.
* Records are displayed as rows in a horizontal table. Each column corresponds to a field:
  * **#** — row number.
  * **Categoria** — search-as-you-type, grouped by Despesas / Receitas.
  * **Nome / Local** — text input with autocomplete from `CommonRecordNames`.
  * **Data** — date picker; defaults to today. Shows future-month warning and current-month suggestion checkbox inside the cell when applicable (same logic as the Record modal).
  * **Valor (R$)** — accepts a formula string (e.g. `50+7`).
  * **Recorrente** — checkbox; mutually exclusive with Parcelado.
  * **Parcelado** — checkbox; mutually exclusive with Recorrente.
  * **Parcelas** — number input; visible only when Parcelado is checked.
  * **Remover** — button to delete that row.
* The table wraps in a scrollable container to support mobile (horizontal scroll).
* Starts with one empty record row.
* **+ Adicionar Registro** button — appends a new empty row at the bottom.
* **Salvar Todos** — validates all rows before saving:
  * If any row is invalid, all errors are shown inline per row and saving is blocked until fixed.
  * If all rows are valid, records are saved sequentially using `saveRecord()` or `saveInstallmentGroup()` (for installment rows). Record names are added to `CommonRecordNames` after each save.
  * On success, navigates back to the main view.

---

## DRIVE SYNC BUTTON

Icon button displayed in the page header when Drive is connected.

* Shows the timestamp of the last successful sync.
* Click → triggers `syncWithDrive()`.
* **Loading state** while sync is in progress.
* **Error state** — flashes red for 3 seconds if sync fails.
* Listens to `dindin:drive-synced`, `dindin:drive-sync-error`, `dindin:drive-auth-needed` events to update its display.


