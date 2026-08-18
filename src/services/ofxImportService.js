import RecordType from '../models/RecordType.js';

const INCOME_TYPES = new Set(['CREDIT', 'DEP', 'DIRECTDEP', 'INT', 'DIV']);
const EXPENSE_TYPES = new Set(['DEBIT', 'ATM', 'POS', 'PAYMENT', 'FEE', 'SRVCHG', 'CHECK', 'CASH', 'DIRECTDEBIT', 'REPEATPMT']);

function inferRecordType(trnType, amount) {
  const type = (trnType ?? '').toUpperCase();
  if (INCOME_TYPES.has(type)) return RecordType.INCOME;
  if (EXPENSE_TYPES.has(type)) return RecordType.EXPENSE;
  return amount >= 0 ? RecordType.INCOME : RecordType.EXPENSE;
}

function parseDtPosted(raw) {
  const str = (raw ?? '').trim();
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const day = str.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function buildTransaction(trnType, dtPosted, trnAmt, name, memo) {
  const amount = parseFloat(trnAmt);
  const cleanName = (name ?? '').trim();
  const cleanMemo = (memo ?? '').trim();
  const fullName =
    cleanMemo && cleanMemo.toLowerCase() !== cleanName.toLowerCase()
      ? `${cleanName} – ${cleanMemo}`
      : cleanName;
  return {
    recordType: inferRecordType(trnType, amount),
    date: parseDtPosted(dtPosted),
    value: String(Math.abs(amount)),
    name: fullName,
  };
}

function extractField(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, 'i'));
  return match ? match[1].trim() : '';
}

function parseSGML(text) {
  const ofxStart = text.indexOf('<OFX');
  const body = ofxStart >= 0 ? text.slice(ofxStart) : text;
  const blockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const transactions = [];
  let match;
  while ((match = blockRegex.exec(body)) !== null) {
    const block = match[1];
    transactions.push(buildTransaction(
      extractField(block, 'TRNTYPE'),
      extractField(block, 'DTPOSTED'),
      extractField(block, 'TRNAMT'),
      extractField(block, 'NAME'),
      extractField(block, 'MEMO'),
    ));
  }
  return transactions;
}

function parseXML(text) {
  return parseSGML(text);
}

function isOFXSGML(text) {
  return /OFXHEADER:/i.test(text) || /<[A-Z]+>[^<\r\n]*(\r?\n|$)/m.test(text);
}

function parseOFX(text) {
  if (isOFXSGML(text)) return parseSGML(text);
  return parseXML(text);
}

function mapTransactionsToBulkRows(transactions) {
  return transactions.map((t) => ({ recordType: t.recordType, name: t.name, date: t.date, value: t.value, tags: [] }));
}

export { parseOFX, mapTransactionsToBulkRows };
