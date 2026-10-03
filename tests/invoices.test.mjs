import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const { invoiceInput, paymentState, supplierIdentity, validatePayment } =
  loadTypeScript("src/lib/invoices/input.ts");
const input = {
  supplierName: "DewiBack GmbH",
  invoiceNumber: "R123",
  date: "2026-10-02",
  dueDate: "2026-10-10",
  totalAmount: "119.00",
  netAmount: "100",
  vatAmount: "19",
  documentId: "a".repeat(64),
  kind: "INVOICE_MATERIAL",
  category: "Hammadde",
};
test("invoice totals, date rollover and invalid VAT sums fail before persistence", () => {
  assert.equal(invoiceInput(input).totalAmount.toFixed(2), "119.00");
  for (const change of [
    { date: "2026-02-29" },
    { dueDate: "2026-10-01" },
    { totalAmount: "118" },
    { totalAmount: "0" },
    { totalAmount: "NaN" },
    { category: "__proto__" },
  ])
    assert.throws(() => invoiceInput({ ...input, ...change }));
});
test("supplier names match spacing and accents, but different tax numbers stay separate", () => {
  assert.equal(
    supplierIdentity("DewiBack GmbH"),
    supplierIdentity(" DEWIBACK  GmbH "),
  );
  assert.equal(
    supplierIdentity("Café Berlin"),
    supplierIdentity("Cafe Berlin"),
  );
  assert.notEqual(
    supplierIdentity("Firma", "DE123"),
    supplierIdentity("Firma", "DE124"),
  );
});
test("partial and closed balances use cents; due today is not overdue", () => {
  assert.deepEqual(
    paymentState("0.30", [{ amount: "0.10" }, { amount: "0.20" }], null),
    { paidAmount: 0.3, outstandingAmount: 0, status: "PAID", overdue: false },
  );
  const partial = paymentState(
    "119",
    [{ amount: "50" }],
    new Date("2026-10-02"),
    new Date("2026-10-02T15:00:00Z"),
  );
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.outstandingAmount, 69);
  assert.equal(partial.overdue, false);
  assert.equal(
    paymentState("119", [], new Date("2026-10-01"), new Date("2026-10-02"))
      .overdue,
    true,
  );
});
test("negative payments and overpayments are rejected", () => {
  const payment = {
    amount: "69",
    date: "2026-10-02",
    method: "BANK",
    requestId: "a7f7cc5a-9200-4500-8077-50988bc1cdd1",
  };
  assert.equal(
    validatePayment(payment, new Prisma.Decimal("69")).amount.toString(),
    "69",
  );
  for (const amount of ["70", "-1", "0"])
    assert.throws(() =>
      validatePayment({ ...payment, amount }, new Prisma.Decimal("69")),
    );
});
const { publicAddress, downloadDocument } = loadTypeScript(
  "src/lib/invoices/remote-document.ts",
  { "@/lib/onedrive/security": { ArchiveError: class extends Error {} } },
);
test("document links cannot target loopback, internal, metadata or reserved networks", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  for (const url of [
    "http://example.com/file.pdf",
    "https://127.0.0.1/a",
    "https://user:password@example.com/a",
    "https://example.com:8080/a",
  ])
    await assert.rejects(downloadDocument(url));
});
