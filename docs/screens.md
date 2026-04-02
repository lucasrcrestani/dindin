# Main View
The content of this page depends on the data stored in the browser:
* If there is no data, it will show buttons to create categories or load a specific .json.
* If there is data, the user can see the *General Balance*.

## GENERAL BALANCE
Shows the balance value (difference between income and expenses) for the current month.

* Income is the sum of all `categories.idealValue` (expense categories only).
* Expenses are the sum of all records in `currentMonth`.
* **All expense categories are always shown**, even those with no records (displayed with R$ 0,00 and status green).

Status rules:
* Red — expenses ≥ 100% of idealValue.
* Yellow — expenses between 75% and 99% of idealValue.
* Green — expenses below 75% of idealValue.

### BAD
Section listing all categories with red status and their actual vs. ideal values.

### WATCHOUT
Section listing all categories with yellow status.

### NO CONTROLE
Section listing all categories with green status.

### CATEGORY DETAIL (Visão Detalhada)
Clicking any category card opens a detail modal for that category and the inspected month.

* Lists all records for that category in the month, sorted by date descending.
* Shows a total sum at the bottom of the list.
* Empty state message when no records exist.
* **Edit button (✏️)** per record — opens the record modal pre-filled; saves in-place.
* **Delete button (✕)** per record — asks for confirmation before removing.
* **Adicionar Lançamento** button — opens the record modal with the category pre-selected.
* The detail modal works for both the current month and historical months (inside the History modal).

### BOTTOM BUTTONS

#### VER HISTÓRICO
Opens a popup listing past months (based on `settings.period`). Selecting a month shows a read-only General Balance for that month. Category cards within the historical view are also clickable and open the Category Detail modal for that month.

#### ENCERRAR MÊS
Sets `currentMonth` to the next calendar month and refreshes the view.

### FLOATING BUTTON (+)
Floating action button (FAB) that opens an action sheet with:
* **Novo Lançamento** — opens record creation modal.
* **Nova Categoria** — opens category creation modal.
* **Gerenciar Categorias** — opens the category management list view.

---

## RECORD MODAL (Novo / Editar Lançamento)
Used both for creating and editing a record.

* **Category** — select (grouped by Despesas / Receitas); can be pre-selected when opened from a category detail.
* **Nome / Local** — text input with autocomplete suggestions from `CommonRecordsName`.
* **Data** — date picker, defaults to today.
* **Valor** — number input.
* When editing, all fields are pre-filled with the existing record's data and the title changes to "Editar Lançamento".
* On first record save: sets `currentMonth` if not yet defined.
* Successful save adds the name to `CommonRecordsName`.

---

## CATEGORY MANAGEMENT VIEW
Full-page list of all categories with edit and delete actions.

* Edit — opens the category modal pre-filled.
* Delete — asks for confirmation, then removes the category and all its records.

---

## SETTINGS MODAL
* **Meses no histórico** — controls `settings.period` (number of past months shown in history).
* **Mês atual** — allows manually setting `currentMonth`.
* **Importar CSV** — two-step flow:
  1. Map each CSV category to an action: create new / merge with existing / skip.
  2. Preview table before confirming.
  3. On confirm: inserts records; if `currentMonth` is not set, defaults to the latest month in the CSV.
  4. **Warning banner** is shown if any CSV months fall outside the visible range defined by `currentMonth` + `period`.


