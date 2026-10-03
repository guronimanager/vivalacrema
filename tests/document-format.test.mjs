import test from "node:test";
import assert from "node:assert/strict";
import { documentKinds, oneDrivePath, safeSegment, validateMetadata, validDate } from "../src/lib/document-format.ts";
const hash = "a".repeat(64);
const metadata = { kind: "INVOICE_MATERIAL", entity: "Firma/../Örnek", date: "2026-09-30", originalName: "fatura.pdf" };
test("archive paths stay within the selected folder with full content identity", () => {
  const path = oneDrivePath(metadata, hash);
  assert.equal(path.split("/")[0], "VLC UG 2026");
  assert.equal(path.split("/").length, 4);
  assert.ok(path.endsWith(`${hash}.pdf`));
  assert.notEqual(path, oneDrivePath(metadata, "b".repeat(64)));
  assert.throws(() => oneDrivePath(metadata, "../file"));
  for (const kind of Object.keys(documentKinds)) {
    assert.ok(oneDrivePath({ ...metadata, kind }, hash).startsWith("VLC UG 2026/2026.09_September/"));
  }
});
test("supplier and employee names cannot inject folders or forbidden OneDrive characters", () => {
  const name = safeSegment(' ../Firma\\Personel:*?<>|#% ');
  assert.ok(!/[\\/"*:<>?|#%]/.test(name));
  assert.ok(!name.startsWith("."));
  assert.equal(safeSegment("..."), "Belirtilmemiş");
  assert.equal(safeSegment("Cafe\u0301"), "Café");
});
test("invalid invoice dates and inherited document types are rejected", () => {
  assert.equal(validDate("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-09-31", "2026-13-01", "2026-9-1"]) {
    assert.equal(validDate(date), false);
    assert.throws(() => validateMetadata({ ...metadata, date }));
  }
  for (const kind of ["__proto__", "constructor", "OTHER"]) assert.throws(() => validateMetadata({ ...metadata, kind }));
  assert.throws(() => validateMetadata({ ...metadata, entity: " " }));
});

test("statement, payroll and receipts use the existing monthly folders", () => {
  assert.ok(oneDrivePath({ ...metadata, kind: "BANK_STATEMENT" }, hash).includes("/01_Bankkontoauszug/"));
  assert.ok(oneDrivePath({ ...metadata, kind: "EMPLOYEE", archiveFolder: "05_Lohnabrechnungen" }, hash).includes("/05_Lohnabrechnungen/"));
  assert.ok(oneDrivePath({ ...metadata, archiveFolder: "04_Quittungen", date: "2027-03-10" }, hash).startsWith("VLC UG 2027/2027.03_März/04_Quittungen/"));
  assert.throws(() => validateMetadata({ ...metadata, archiveFolder: "../../" }));
});

test("explicit archive month is independent from document date and rejects invalid destinations", () => {
  assert.ok(oneDrivePath({ ...metadata, archivePeriod: "2025-12" }, hash).startsWith("VLC UG 2025/2025.12_Dezember/"));
  assert.equal(validateMetadata({ ...metadata, archivePeriod: "2025-12" }).date, metadata.date);
  for (const archivePeriod of ["2026-13", "2026-00", "2026-9", "../other", 2026]) assert.throws(() => validateMetadata({ ...metadata, archivePeriod }));
});
