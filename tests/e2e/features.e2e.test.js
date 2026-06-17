import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { collectLogs, assertNoErrors, hasLog, waitForBootstrap, clearAppData, seedDatabase } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'fixtures/data.json');

/** Pre-built fixture with 2 categories, 2 records and settings for 2026-05 */
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

/** Minimal seed for tests that only need categories + settings */
const SEED_CATEGORIES_ONLY = {
  categories: FIXTURE.categories,
  settings: FIXTURE.settings,
  records: [],
  commonRecordNames: [],
};

// ---------------------------------------------------------------------------
// Helper: open the FAB action-sheet and click a menu item by its text
// ---------------------------------------------------------------------------
async function openFabMenu(page, itemText) {
  await page.click('#fab');
  await page.waitForSelector('.action-sheet', { state: 'attached' });
  await page.getByRole('button', { name: itemText }).click();
}

// ---------------------------------------------------------------------------
// Helper: fill and submit the "Novo Lançamento" record modal
// ---------------------------------------------------------------------------
async function fillRecordModal(page, { categoryName, name, date, value, tags = ['geral'], recurring = false, installment = false, installmentCount }) {
  // Select category via autocomplete
  await page.focus('#rec-category-search');
  await page.fill('#rec-category-search', categoryName);
  await page.waitForSelector('#rec-category-list .autocomplete-item', { state: 'visible' });
  await page.click('#rec-category-list .autocomplete-item');

  await page.fill('#rec-name', name);
  await page.fill('#rec-date', date);
  await page.fill('#rec-value', value);

  for (const tag of tags) {
    await page.fill('#rec-tags', tag);
    await page.press('#rec-tags', 'Enter');
  }

  if (recurring) await page.check('#rec-recurring');

  if (installment) {
    await page.check('#rec-installment');
    await page.waitForSelector('#rec-installment-count-group', { state: 'visible' });
    await page.fill('#rec-installment-count', String(installmentCount));
  }

  await page.click('#form-record button[type="submit"]');
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

test.describe('DinDin — E2E Feature Tests', () => {

  // ── 1. App bootstraps without errors ─────────────────────────────────────
  test('app loads and shows empty state on fresh database', async ({ page }) => {
    const logs = collectLogs(page);

    await page.goto('/');
    await waitForBootstrap(page);

    // Empty state should be visible when there are no categories
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state__title')).toContainText('Bem-vindo');

    // Bootstrap success log must be present
    expect(hasLog(logs, '[Bootstrap] DinDin inicializado')).toBe(true);

    assertNoErrors(logs);
  });

  // ── 2. Read .json — load fixture data via file input ──────────────────────
  test('read .json — loads categories and records from a JSON file', async ({ page }) => {
    const logs = collectLogs(page);

    await page.goto('/');
    await waitForBootstrap(page);

    // Trigger the file chooser before clicking the button
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#btn-load-json'),
    ]);
    await fileChooser.setFiles(FIXTURE_PATH);

    // App reloads data and renders main page with categories
    await page.waitForSelector('.balance-view', { timeout: 10000 });

    await expect(page.locator('.category-card').first()).toBeVisible();
    await expect(page.locator('[data-category-id="cat-expense-001"]')).toBeVisible();
    await expect(page.locator('[data-category-id="cat-income-001"]')).toBeVisible();

    assertNoErrors(logs);
  });

  // ── 3. Create category from scratch ──────────────────────────────────────
  test('create category — new category appears in main page', async ({ page }) => {
    const logs = collectLogs(page);

    await page.goto('/');
    await waitForBootstrap(page);

    // Click "Nova Categoria" from empty state
    await page.click('#btn-create-category');
    await page.waitForSelector('#modal-cat-title', { state: 'visible' });

    await page.fill('#cat-name', 'Alimentação');
    await page.selectOption('#cat-type', 'expense');
    await page.fill('#cat-ideal', '500');

    await page.click('#form-category button[type="submit"]');

    // Modal should close and main page should re-render with the new category
    await page.waitForSelector('#modal-cat-title', { state: 'detached' });
    await page.waitForSelector('.balance-view', { timeout: 8000 });

    await expect(page.locator('.category-card__name').first()).toContainText('Alimentação');

    // Category save log must be present
    expect(hasLog(logs, '[Category] Categoria salva:')).toBe(true);

    assertNoErrors(logs);
  });

  // ── 4. Create simple expense record ──────────────────────────────────────
  test('create expense record — record is saved and balance updates', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, SEED_CATEGORIES_ONLY);
    await waitForBootstrap(page);

    await openFabMenu(page, 'Novo Lançamento');
    await page.waitForSelector('#modal-rec-title', { state: 'visible' });

    await fillRecordModal(page, {
      categoryName: 'Alimentação',
      name: 'Supermercado Extra',
      date: '2026-05-15',
      value: '120',
      tags: ['mercado'],
    });

    // Modal closes and page re-renders
    await page.waitForSelector('#modal-rec-title', { state: 'detached' });
    await page.waitForSelector('.balance-view', { timeout: 8000 });

    // The expense category should now show a non-zero actual value
    await expect(page.locator('[data-category-id="cat-expense-001"] .category-card__actual')).not.toContainText('R$ 0');

    // Record saved log must be present
    expect(hasLog(logs, '[Add Record] Record saved:')).toBe(true);

    assertNoErrors(logs);
  });

  // ── 5. Create income record ───────────────────────────────────────────────
  test('create income record — income category balance updates', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, SEED_CATEGORIES_ONLY);
    await waitForBootstrap(page);

    await openFabMenu(page, 'Novo Lançamento');
    await page.waitForSelector('#modal-rec-title', { state: 'visible' });

    await fillRecordModal(page, {
      categoryName: 'Salário',
      name: 'Pagamento mensal',
      date: '2026-05-05',
      value: '3500',
      tags: ['salario'],
    });

    await page.waitForSelector('#modal-rec-title', { state: 'detached' });
    await page.waitForSelector('.balance-view', { timeout: 8000 });

    await expect(page.locator('[data-category-id="cat-income-001"] .category-card__actual')).not.toContainText('R$ 0');

    expect(hasLog(logs, '[Add Record] Record saved:')).toBe(true);
    assertNoErrors(logs);
  });

  // ── 6. Create recurring record ────────────────────────────────────────────
  test('create recurring record — recurring section shows the record', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, SEED_CATEGORIES_ONLY);
    await waitForBootstrap(page);

    await openFabMenu(page, 'Novo Lançamento');
    await page.waitForSelector('#modal-rec-title', { state: 'visible' });

    await fillRecordModal(page, {
      categoryName: 'Alimentação',
      name: 'Aluguel',
      date: '2026-05-01',
      value: '1200',
      tags: ['fixo'],
      recurring: true,
    });

    await page.waitForSelector('#modal-rec-title', { state: 'detached' });
    await page.waitForSelector('.balance-view', { timeout: 8000 });

    // Recurring records card should be visible with the new record
    // The component renders a div.recurring-card (see recurringRecordsCard.js)
    await expect(page.locator('.recurring-card')).toBeVisible();

    expect(hasLog(logs, '[Add Record] Record saved:')).toBe(true);
    assertNoErrors(logs);
  });

  // ── 7. Create installment record ──────────────────────────────────────────
  test('create installment record — all installments are created', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, SEED_CATEGORIES_ONLY);
    await waitForBootstrap(page);

    await openFabMenu(page, 'Novo Lançamento');
    await page.waitForSelector('#modal-rec-title', { state: 'visible' });

    await fillRecordModal(page, {
      categoryName: 'Alimentação',
      name: 'Televisão',
      date: '2026-05-10',
      value: '3600',
      tags: ['eletronico'],
      installment: true,
      installmentCount: 12,
    });

    await page.waitForSelector('#modal-rec-title', { state: 'detached' });
    await page.waitForSelector('.balance-view', { timeout: 8000 });

    // Installment group saved log must mention 12 installments
    expect(hasLog(logs, '[Add Record] Installment group saved: 12')).toBe(true);
    assertNoErrors(logs);
  });

  // ── 8. Check history (audit log) ─────────────────────────────────────────
  test('check history — audit log page shows entries', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, FIXTURE);
    await waitForBootstrap(page);

    await page.click('#btn-audit-log');
    await page.waitForSelector('.audit-log-page', { state: 'visible' });

    // There should be at least 2 entries (the 2 categories from fixture)
    // The audit log renders entries with class .audit-entry inside .audit-date-group
    const auditItems = page.locator('.audit-entry');
    await expect(auditItems.first()).toBeVisible();

    const count = await auditItems.count();
    expect(count).toBeGreaterThan(0);

    assertNoErrors(logs);
  });

  // ── 9. Export .json ───────────────────────────────────────────────────────
  test('export .json — triggers download with valid JSON content', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, FIXTURE);
    await waitForBootstrap(page);

    // Open settings modal
    await page.click('#btn-settings');
    await page.waitForSelector('#modal-cfg-title', { state: 'visible' });

    // Intercept the download triggered by anchor.click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-cfg-export-json'),
    ]);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const content = Buffer.concat(chunks).toString('utf-8');

    // Content must be valid JSON with categories and records
    const parsed = JSON.parse(content);
    expect(parsed.categories).toBeDefined();
    expect(parsed.records).toBeDefined();
    expect(parsed.categories.length).toBeGreaterThan(0);

    // Export log must be present
    expect(hasLog(logs, '[Export] JSON exportado')).toBe(true);

    assertNoErrors(logs);
  });

  // ── 10. Bulk add ──────────────────────────────────────────────────────────
  test('bulk add — multiple records saved at once', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, SEED_CATEGORIES_ONLY);
    await waitForBootstrap(page);

    await openFabMenu(page, 'Lançamentos em Massa');
    await page.waitForSelector('.bulk-add-page', { state: 'visible' });

    // There's already one empty row; fill it
    const row = page.locator('.bulk-row').first();

    // Select category via autocomplete
    await row.locator('.bulk-cat-search').focus();
    await row.locator('.bulk-cat-search').fill('Alimentação');
    await page.waitForSelector('.bulk-cat-list .autocomplete-item', { state: 'visible' });
    await page.locator('.bulk-cat-list .autocomplete-item').first().click();

    await row.locator('.bulk-name').fill('Mercado do João');
    await row.locator('.bulk-date').fill('2026-05-20');
    await row.locator('.bulk-value').fill('75');
    await row.locator('.bulk-tags-input').fill('feira,');
    await expect(row.locator('.bulk-tags-container [data-tag="feira"]')).toBeVisible();

    // Add a second row
    await page.click('#btn-bulk-add-row');
    const row2 = page.locator('.bulk-row').nth(1);

    await row2.locator('.bulk-cat-search').focus();
    await row2.locator('.bulk-cat-search').fill('Alimentação');
    await page.waitForSelector('.bulk-cat-list .autocomplete-item', { state: 'visible' });
    await page.locator('.bulk-cat-list .autocomplete-item').first().click();

    await row2.locator('.bulk-name').fill('Padaria');
    await row2.locator('.bulk-date').fill('2026-05-21');
    await row2.locator('.bulk-value').fill('30');
    await row2.locator('.bulk-tags-input').fill('cafe ');
    await expect(row2.locator('.bulk-tags-container [data-tag="cafe"]')).toBeVisible();

    // Save all
    await page.click('#btn-bulk-save');

    // Should navigate back to main page after saving
    await page.waitForSelector('.balance-view', { timeout: 10000 });

    // Bulk add saving log must be present (covers both records)
    expect(hasLog(logs, '[Bulk Add] Saving 2 record(s)')).toBe(true);
    expect(hasLog(logs, '[BulkAdd] 2 registros adicionados com sucesso')).toBe(true);

    assertNoErrors(logs);
  });

  // ── 11. No JS errors across the full app lifecycle ────────────────────────
  test('no unhandled JS errors on page load and navigation', async ({ page }) => {
    const logs = collectLogs(page);

    await seedDatabase(page, FIXTURE);
    await waitForBootstrap(page);

    // Navigate to audit log and back
    await page.click('#btn-audit-log');
    await page.waitForSelector('.audit-log-page');
    await page.click('#btn-audit-back');
    await page.waitForSelector('.balance-view');

    // Open settings and close
    await page.click('#btn-settings');
    await page.waitForSelector('#modal-cfg-title', { state: 'visible' });
    await page.click('.modal__close');
    await page.waitForSelector('#modal-cfg-title', { state: 'detached' });

    assertNoErrors(logs);
  });

  // ── 12. Record tags — create, display, and filter ─────────────────────────
  test('record tags — create record with tags, verify display and tag filter', async ({ page }) => {
    const logs = collectLogs(page);

    // Seed categories where "Alimentação" already has a category-level tag
    const seedWithTaggedCategory = {
      categories: [
        { ...FIXTURE.categories[0], tags: ['essencial'] },
        FIXTURE.categories[1],
      ],
      settings: FIXTURE.settings,
      records: [],
      commonRecordNames: [],
    };

    await seedDatabase(page, seedWithTaggedCategory);
    await waitForBootstrap(page);

    // Create a record with a record-level tag "viagem"
    await openFabMenu(page, 'Novo Lançamento');
    await page.waitForSelector('#modal-rec-title', { state: 'visible' });

    await fillRecordModal(page, {
      categoryName: 'Alimentação',
      name: 'Restaurante em viagem',
      date: '2026-05-20',
      value: '80',
      tags: ['viagem'],
    });

    await page.waitForSelector('#modal-rec-title', { state: 'detached' });
    await page.waitForSelector('.balance-view', { timeout: 8000 });

    // Record saved log must be present
    expect(hasLog(logs, '[Add Record] Record saved:')).toBe(true);

    // Tag filter bar should be visible with both tags (category "essencial" + record "viagem")
    await expect(page.locator('.balance-tag-filter')).toBeVisible();
    await expect(page.locator('.balance-tag-filter .tag-badge--filter[data-tag="essencial"]')).toBeVisible();
    await expect(page.locator('.balance-tag-filter .tag-badge--filter[data-tag="viagem"]')).toBeVisible();

    // Click "viagem" filter — Alimentação card should remain visible, Salário card hidden
    await page.click('.balance-tag-filter .tag-badge--filter[data-tag="viagem"]');
    expect(hasLog(logs, '[Tag Filter] Tag selecionada: viagem')).toBe(true);
    await expect(page.locator('[data-category-id="cat-expense-001"]')).toBeVisible();

    // Click again to deactivate filter — both sections visible again
    await page.click('.balance-tag-filter .tag-badge--filter[data-tag="viagem"]');
    expect(hasLog(logs, '[Tag Filter] Tag selecionada: (limpo)')).toBe(true);

    // Open Category Detail to verify combined tags are shown
    await page.click('[data-category-id="cat-expense-001"]');
    await page.waitForSelector('.record-list__item', { state: 'visible' });

    // The record item should display the "essencial" (from category) and "viagem" (own) tags
    await expect(page.locator('.record-list__tags .tag-badge').filter({ hasText: 'essencial' })).toBeVisible();
    await expect(page.locator('.record-list__tags .tag-badge').filter({ hasText: 'viagem' })).toBeVisible();

    assertNoErrors(logs);
  });

  test('record modal tags — auto-fill category tags, require tags, and suggest existing tags', async ({ page }) => {
    const logs = collectLogs(page);

    const seedWithTags = {
      categories: [
        { ...FIXTURE.categories[0], tags: ['essencial', 'mercado'] },
        FIXTURE.categories[1],
      ],
      settings: FIXTURE.settings,
      records: [
        { ...FIXTURE.records[0], tags: ['viagem'] },
      ],
      commonRecordNames: [],
    };

    await seedDatabase(page, seedWithTags);
    await waitForBootstrap(page);

    await openFabMenu(page, 'Novo Lançamento');
    await page.waitForSelector('#modal-rec-title', { state: 'visible' });

    await page.fill('#rec-category-search', 'Salário');
    await page.waitForSelector('#rec-category-list .autocomplete-item', { state: 'visible' });
    await page.click('#rec-category-list .autocomplete-item');
    await page.fill('#rec-name', 'Sem tag');
    await page.fill('#rec-date', '2026-05-22');
    await page.fill('#rec-value', '100');
    await page.click('#form-record button[type="submit"]');
    await expect(page.locator('#rec-tags-error')).toBeVisible();

    await page.fill('#rec-category-search', 'Alimentação');
    await page.waitForSelector('#rec-category-list .autocomplete-item', { state: 'visible' });
    await page.click('#rec-category-list .autocomplete-item');
    await expect(page.locator('#rec-tags-container [data-tag="essencial"]')).toBeVisible();
    await expect(page.locator('#rec-tags-container [data-tag="mercado"]')).toBeVisible();

    await page.fill('#rec-tags', 'delivery,');
    await expect(page.locator('#rec-tags-container [data-tag="delivery"]')).toBeVisible();

    await page.fill('#rec-tags', 'casa');
    await page.press('#rec-tags', 'Space');
    await expect(page.locator('#rec-tags-container [data-tag="casa"]')).toBeVisible();

    await page.fill('#rec-tags', 'via');
    await page.waitForSelector('#rec-tags-list .autocomplete-item', { state: 'visible' });
    await page.click('#rec-tags-list .autocomplete-item');
    await expect(page.locator('#rec-tags-container [data-tag="viagem"]')).toBeVisible();

    await page.click('#form-record button[type="submit"]');
    await page.waitForSelector('#modal-rec-title', { state: 'detached' });
    expect(hasLog(logs, '[Add Record] Categoria selecionada: Alimentação')).toBe(true);
    expect(hasLog(logs, '[Add Record] Record saved:')).toBe(true);

    assertNoErrors(logs);
  });
});
