import { describe, it, expect } from 'vitest';
import { parseOFX, mapTransactionsToBulkRows } from '../src/services/ofxImportService.js';

const OFX_SGML_V1 = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<DTSTART>20240101
<DTEND>20240131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240105000000[-3:BRT]
<TRNAMT>-150.00
<FITID>001
<NAME>Supermercado Extra
<MEMO>Compras
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240110
<TRNAMT>3000.00
<FITID>002
<NAME>Salario
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const OFX_XML_V2 = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20240205000000</DTPOSTED>
            <TRNAMT>-80.50</TRNAMT>
            <FITID>003</FITID>
            <NAME>Farmacia</NAME>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEP</TRNTYPE>
            <DTPOSTED>20240210</DTPOSTED>
            <TRNAMT>500.00</TRNAMT>
            <FITID>004</FITID>
            <NAME>Deposito</NAME>
            <MEMO>Deposito</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

describe('parseOFX', () => {
  describe('SGML v1', () => {
    it('parses transaction count', () => {
      const result = parseOFX(OFX_SGML_V1);
      expect(result).toHaveLength(2);
    });
    it('parses DEBIT transaction correctly', () => {
      const [debit] = parseOFX(OFX_SGML_V1);
      expect(debit.date).toBe('2024-01-05');
      expect(debit.value).toBe('150');
      expect(debit.name).toBe('Supermercado Extra – Compras');
      expect(debit.recordType).toBe('expense');
    });
    it('parses CREDIT transaction correctly', () => {
      const [, credit] = parseOFX(OFX_SGML_V1);
      expect(credit.date).toBe('2024-01-10');
      expect(credit.value).toBe('3000');
      expect(credit.name).toBe('Salario');
      expect(credit.recordType).toBe('income');
    });
  });

  describe('XML v2', () => {
    it('parses transaction count', () => {
      const result = parseOFX(OFX_XML_V2);
      expect(result).toHaveLength(2);
    });
    it('parses DEBIT transaction correctly', () => {
      const [debit] = parseOFX(OFX_XML_V2);
      expect(debit.date).toBe('2024-02-05');
      expect(debit.value).toBe('80.5');
      expect(debit.name).toBe('Farmacia');
      expect(debit.recordType).toBe('expense');
    });
    it('does not append memo when memo equals name', () => {
      const [, dep] = parseOFX(OFX_XML_V2);
      expect(dep.name).toBe('Deposito');
    });
    it('parses DEP as income', () => {
      const [, dep] = parseOFX(OFX_XML_V2);
      expect(dep.recordType).toBe('income');
    });
  });
});

describe('mapTransactionsToBulkRows', () => {
  it('maps transactions to bulk row shape', () => {
    const transactions = parseOFX(OFX_SGML_V1);
    const rows = mapTransactionsToBulkRows(transactions);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ recordType: 'expense', name: 'Supermercado Extra – Compras', date: '2024-01-05', value: '150', tags: [] });
  });
});
