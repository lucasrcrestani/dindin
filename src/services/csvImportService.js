import RecordType from '../models/RecordType.js';
import { createCategory } from '../models/Category.js';
import { createRecord } from '../models/Record.js';
import { saveCategory } from './categoryService.js';
import { saveRecord } from './recordService.js';

/** @typedef {{ name: string, tags: string[], recordType: string, idealValue: number, monthValues: Object.<string, number> }} ParsedCategory */
/** @typedef {{ months: string[], categories: ParsedCategory[] }} ParsedCSV */

const MONTH_MAP = {
  'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
  'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
};

/**
 * Convert a PT-BR month abbreviation label (e.g. "jan.-25") to a YYYY-MM key.
 * @param {string} label
 * @returns {string|null}
 */
function parseMonthLabel(label) {
  const match = label.trim().toLowerCase().match(/^([a-z]{3})\.?-(\d{2})$/);
  if (!match) return null;
  const monthNum = MONTH_MAP[match[1]];
  if (!monthNum) return null;
  const year = parseInt(match[2], 10) + 2000;
  return `${year}-${monthNum}`;
}

/**
 * Convert a Brazilian currency string to a number.
 * Returns null for empty/blank cells.
 * @param {string|null|undefined} str
 * @returns {number|null}
 */
function parseBrazilianCurrency(str) {
  if (!str || !str.trim()) return null;
  // Remove "R$", spaces, then convert BR format to standard float
  const cleaned = str.trim()
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')       // remove thousand separators
    .replace(',', '.');        // decimal separator
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

/**
 * Minimal CSV parser that handles quoted fields containing commas.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSVRows(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const fields = [];
    let inQuote = false;
    let field = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

const IGNORED_NAMES = new Set(['despesas', 'total das despesas']);

/**
 * Parse a CSV string in the dindin format.
 * @param {string} text
 * @returns {ParsedCSV}
 */
function parseCSV(text) {
  console.group('[CSV Import] parseCSV — início');
  console.log('Tamanho do texto:', text.length, 'caracteres');

  const rows = parseCSVRows(text);
  console.log('Linhas brutas encontradas:', rows.length);
  if (rows.length < 2) {
    console.error('CSV inválido: sem linhas suficientes.');
    console.groupEnd();
    throw new Error('CSV inválido: sem linhas suficientes.');
  }

  // --- Header row: find month column indices ---
  const headerRow = rows[0];
  console.log('Cabeçalho (row[0]):', headerRow);

  /** @type {{ index: number, monthKey: string }[]} */
  const monthCols = [];
  for (let i = 1; i < headerRow.length; i++) {
    const key = parseMonthLabel(headerRow[i]);
    if (key) {
      monthCols.push({ index: i, monthKey: key });
    } else if (headerRow[i].trim()) {
      console.warn(`  Coluna ${i} ignorada na detecção de meses: "${headerRow[i]}".`);
    }
  }
  if (monthCols.length === 0) {
    console.error('Nenhuma coluna de mês reconhecida. Verifique o formato (ex.: "jan.-25").');
    console.groupEnd();
    throw new Error('CSV inválido: nenhuma coluna de mês encontrada.');
  }
  console.log('Meses detectados:', monthCols.map((c) => c.monthKey));

  // IDEAL column: the column with header "IDEAL" (case-insensitive)
  let idealColIndex = -1;
  for (let i = 1; i < headerRow.length; i++) {
    if (headerRow[i].trim().toUpperCase() === 'IDEAL') {
      idealColIndex = i;
      break;
    }
  }
  console.log('Coluna IDEAL:', idealColIndex === -1 ? 'não encontrada' : `índice ${idealColIndex}`);

  const months = monthCols.map((c) => c.monthKey);
  /** @type {ParsedCategory[]} */
  const categories = [];

  let currentTag = null;
  let currentType = RecordType.EXPENSE;
  let pastTotalLine = false;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[0] ? row[0].trim() : '';

    if (!name) continue; // blank row

    const nameLower = name.toLowerCase();

    // Detect "Total das Despesas" — switch to INCOME after this line
    if (nameLower === 'total das despesas') {
      console.log(`  [linha ${r}] Marcador "Total das Despesas" encontrado — próximas linhas serão Receita.`);
      pastTotalLine = true;
      continue;
    }

    if (pastTotalLine) {
      currentType = RecordType.INCOME;
    }

    // Check if all month columns are empty → this is a tag/group header row
    const allMonthsEmpty = monthCols.every((col) => !row[col.index] || !row[col.index].trim());

    if (allMonthsEmpty) {
      if (!IGNORED_NAMES.has(nameLower)) {
        currentTag = name;
        console.log(`  [linha ${r}] Tag/grupo detectado: "${currentTag}"`);
      } else {
        console.log(`  [linha ${r}] Linha ignorada (nome reservado): "${name}"`);
      }
      continue;
    }

    // Category row — parse month values
    /** @type {Object.<string, number>} */
    const monthValues = {};
    for (const col of monthCols) {
      const raw = row[col.index];
      const value = parseBrazilianCurrency(raw);
      if (value !== null) {
        monthValues[col.monthKey] = value;
      } else if (raw && raw.trim()) {
        console.warn(`  [linha ${r}] Valor não parseável na coluna ${col.monthKey}: "${raw}"`);
      }
    }

    // Parse ideal value from IDEAL column
    let idealValue = 0;
    if (idealColIndex !== -1) {
      const raw = row[idealColIndex];
      const parsed = parseBrazilianCurrency(raw);
      if (parsed !== null) idealValue = parsed;
    }

    const cat = {
      name,
      tags: currentTag ? [currentTag] : [],
      recordType: currentType,
      idealValue,
      monthValues,
    };
    console.log(`  [linha ${r}] Categoria parseada:`, cat);
    categories.push(cat);
  }

  console.log(`parseCSV concluído — ${categories.length} categorias, ${months.length} meses.`);
  console.groupEnd();
  return { months, categories };
}

/**
 * @typedef {{ action: 'create'|'mapTo'|'skip', existingCategoryId?: string }} Mapping
 */

/**
 * Execute the import: create or merge categories, then insert records.
 * @param {ParsedCategory[]} parsedCategories
 * @param {Mapping[]} mappings - one entry per parsedCategory, same order
 * @returns {Promise<{ categoriesCreated: number, recordsInserted: number }>}
 */
async function executeCSVImport(parsedCategories, mappings) {
  console.group('[CSV Import] executeCSVImport — início');
  console.log('Total de categorias para processar:', parsedCategories.length);
  console.log('Mapeamentos recebidos:', mappings);

  let categoriesCreated = 0;
  let recordsInserted = 0;
  let categoriesSkipped = 0;
  let categoriesMerged = 0;

  for (let i = 0; i < parsedCategories.length; i++) {
    const parsed = parsedCategories[i];
    const mapping = mappings[i];

    if (mapping.action === 'skip') {
      console.log(`  [${i}] SKIP — "${parsed.name}"`);
      categoriesSkipped++;
      continue;
    }

    let categoryId;

    if (mapping.action === 'create') {
      console.groupCollapsed(`  [${i}] CREATE — "${parsed.name}"`);
      const saved = await saveCategory(createCategory({
        name: parsed.name,
        tags: parsed.tags,
        recordType: parsed.recordType,
        idealValue: parsed.idealValue,
      }));
      categoryId = saved.id;
      console.log('Categoria criada com id:', categoryId);
      console.groupEnd();
      categoriesCreated++;
    } else {
      // mapTo
      categoryId = mapping.existingCategoryId;
      console.log(`  [${i}] MERGE — "${parsed.name}" → categoryId existente: ${categoryId}`);
      categoriesMerged++;
    }

    console.groupCollapsed(`  [${i}] Inserindo registros para "${parsed.name}" (${Object.keys(parsed.monthValues).length} meses)`);
    for (const [monthKey, value] of Object.entries(parsed.monthValues)) {
      const record = createRecord({
        categoryId,
        value,
        name: parsed.name,
        date: `${monthKey}-01`,
      });
      await saveRecord(record);
      console.log(`    ${monthKey} → R$ ${value.toFixed(2)} (id: ${record.id})`);
      recordsInserted++;
    }
    console.groupEnd();
  }

  const summary = { categoriesCreated, categoriesMerged, categoriesSkipped, recordsInserted };
  console.log('executeCSVImport concluído:', summary);
  console.groupEnd();
  return summary;
}

export { parseCSV, parseMonthLabel, parseBrazilianCurrency, executeCSVImport };
