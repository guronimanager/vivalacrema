import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const {
  assertCsvAccount,
  csvTable,
  csvRows,
  guessColumns,
  signedMoney,
  statementDate,
  validateRows,
} = loadTypeScript("src/lib/statements/input.ts");
test("German CSV, quotes, multiline purpose and debit/credit signs", () => {
  const table = csvTable(
    '\uFEFFBuchungstag;Betrag;Verwendungszweck;Referenz\r\n01.10.2026;-1.234,56;"Supplier; invoice\nABC";REF1\r\n02.10.2026;115,02;SumUp;REF2',
  );
  const rows = csvRows(table, guessColumns(table[0]));
  assert.equal(rows[0].amount, "-1234.56");
  assert.equal(rows[0].date, "2026-10-01");
  assert.equal(rows[0].description, "Supplier; invoice\nABC");
  assert.equal(rows[1].amount, "115.02");
});
test("Soll/Haben, ISO dates, decimal commas and malformed money/date rejected", () => {
  const table = csvTable(
    "sep=;\nDate;Amount;Description;Soll/Haben\n2026-10-01;50,00;Debit;S\n2026-10-02;60;Credit;H",
  );
  const rows = csvRows(table, guessColumns(table[0]));
  assert.equal(rows[0].amount, "-50.00");
  assert.equal(rows[1].amount, "60.00");
  for (const amount of [
    "1.234",
    "115.02000000000001",
    "0",
    "Infinity",
    "1,23,45",
  ])
    assert.throws(() => signedMoney(amount));
  assert.throws(() => statementDate("31.02.2026"));
  assert.throws(() => csvTable('date;amount\n"bad'));
  assert.throws(() => validateRows([]));
  assert.throws(() =>
    csvRows(csvTable("date;amount\n2026-10-01;2;extra"), {
      date: 0,
      amount: 1,
      description: -1,
      reference: -1,
      direction: -1,
    }),
  );
});
test("CSV supports escaped quotes and rejects ambiguous directions", () => {
  const table = csvTable(
    'Date,Amount,Description\n2026-10-01,-50.05,"Supplier ""invoice"""',
  );
  assert.equal(
    csvRows(table, guessColumns(table[0]))[0].description,
    'Supplier "invoice"',
  );
  assert.throws(() =>
    csvRows(
      [
        ["date", "amount", "direction"],
        ["2026-10-01", "10", "?"],
      ],
      { date: 0, amount: 1, description: -1, reference: -1, direction: 2 },
    ),
  );
});

test("Sparkasse counterparty and purpose combine; pending and foreign currency fail", () => {
  const table = csvTable(
    "Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag;Waehrung;Info\nDETEST;01.10.2026;01.10.2026;SEPA;INV2026001;Supplier GmbH;-119,00;EUR;Umsatz gebucht",
  );
  const columns = guessColumns(table[0]);
  const rows = csvRows(table, columns);
  assert.equal(rows[0].description, "Supplier GmbH · INV2026001");
  assert.equal(rows[0].amount, "-119.00");
  const pending = table.map((r) => [...r]);
  pending[1][8] = "Umsatz vorgemerkt";
  assert.throws(() => csvRows(pending, columns));
  const foreign = table.map((r) => [...r]);
  foreign[1][7] = "USD";
  assert.throws(() => csvRows(foreign, columns));
});

test("Sparkasse account IBAN cannot silently target another bank account", () => {
  const table = csvTable(
    "Auftragskonto;Buchungstag;Betrag\nDE00123456789012345678;01.10.2026;-10",
  );
  assertCsvAccount(table, "DE00 1234 5678 9012 3456 78");
  assert.throws(() => assertCsvAccount(table, "DE00123456789012345679"));
});
