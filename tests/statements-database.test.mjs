import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const target = process.env.STATEMENT_TEST_DATABASE_URL;
test(
  "isolated statement overlap, manual match, concurrency and no duplicate expense/balance",
  { skip: !target },
  async () => {
    const url = new URL(target);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "55439");
    assert.equal(url.username, "vlc_test");
    assert.match(url.pathname, /^\/vlc_statement_test_/);
    const prisma = new PrismaClient({ datasources: { db: { url: target } } });
    const overrides = { "@/lib/prisma": { prisma } };
    const { importStatement, previewStatement } = loadTypeScript(
      "src/lib/statements/service.ts",
      overrides,
    );
    const { saveInvoice, savePayment, listInvoices } = loadTypeScript(
      "src/lib/invoices/service.ts",
      overrides,
    );
    try {
      const business = await prisma.business.create({
        data: { name: "ISOLATED LOCAL ONLY" },
      });
      const bank = await prisma.bankAccount.create({
        data: {
          businessId: business.id,
          name: "Test bank",
          type: "BANK",
          balance: "5000",
        },
      });
      const cash = await prisma.bankAccount.create({
        data: { businessId: business.id, name: "Cash", type: "CASH" },
      });
      const rows = [
        {
          date: "2026-10-01",
          amount: "-119.00",
          description: "Supplier INV2026001",
          reference: "BANK1",
        },
        {
          date: "2026-10-02",
          amount: "60.00",
          description: "SumUp payout",
          reference: "BANK2",
        },
      ];
      await assert.rejects(importStatement(cash.id, rows, ["", ""], "doc"));
      const invoice = await saveInvoice(
        {
          supplierName: "Supplier",
          invoiceNumber: "INV2026001",
          date: "2026-10-01",
          totalAmount: "119",
          netAmount: "100",
          vatAmount: "19",
          documentId: "d".repeat(64),
          kind: "INVOICE_MATERIAL",
          category: "Hammadde",
        },
        "test-owner",
      );
      const first = await importStatement(bank.id, rows, ["", ""], "doc");
      assert.equal(first.transactions.filter((r) => r.created).length, 2);
      assert.equal(
        (
          await prisma.transaction.findUnique({
            where: { id: first.transactions[1].id },
          })
        ).type,
        "TRANSFER",
      );
      const repeat = await importStatement(bank.id, rows, ["", ""], "doc");
      assert.equal(repeat.transactions.filter((r) => r.created).length, 0);
      const overlap = await importStatement(
        bank.id,
        [rows[1], { ...rows[1], date: "2026-10-03", reference: "BANK3" }],
        ["", ""],
        "doc2",
      );
      assert.equal(overlap.transactions.filter((r) => r.created).length, 1);
      const preview = await previewStatement(bank.id, rows, "test-owner");
      assert.equal(preview[0].suggestions[0].strong, true);
      assert.equal(preview[0].duplicateId, first.transactions[0].id);
      await savePayment(
        {
          invoiceId: invoice.id,
          transactionId: first.transactions[0].id,
          method: "BANK",
          date: "2026-10-01",
          amount: "119",
          requestId: randomUUID(),
        },
        "test-owner",
      );
      assert.equal((await listInvoices("test-owner"))[0].status, "PAID");
      assert.equal(await prisma.expense.count(), 1);
      assert.equal(
        (
          await prisma.bankAccount.findUnique({ where: { id: bank.id } })
        ).balance.toString(),
        "5000",
      );
      const manual = await prisma.transaction.create({
        data: {
          businessId: business.id,
          bankAccountId: bank.id,
          date: new Date("2026-10-04"),
          amount: "25",
          type: "EXPENSE",
          source: "manual",
        },
      });
      const manualRow = {
        date: "2026-10-04",
        amount: "-25",
        description: "Manual bank evidence",
        reference: "REF4",
      };
      await assert.rejects(importStatement(bank.id, [manualRow], [""], "doc3"));
      const linked = await importStatement(
        bank.id,
        [manualRow],
        [manual.id],
        "doc3",
      );
      assert.equal(linked.transactions[0].id, manual.id);
      assert.equal(linked.transactions[0].created, false);
      await assert.rejects(
        importStatement(
          bank.id,
          [manualRow, manualRow],
          [manual.id, manual.id],
          "doc3",
        ),
      );
      const identical = {
        date: "2026-10-05",
        amount: "-10",
        description: "Two legitimate equal payments",
        reference: "",
      };
      const doubled = await importStatement(
        bank.id,
        [identical, identical],
        ["", ""],
        "doc4",
      );
      assert.equal(doubled.transactions.length, 2);
      assert.notEqual(doubled.transactions[0].id, doubled.transactions[1].id);
      const repeatedDouble = await importStatement(
        bank.id,
        [identical, identical],
        ["", ""],
        "doc4",
      );
      assert.equal(
        repeatedDouble.transactions.filter((r) => r.created).length,
        0,
      );
      const concurrentRow = {
        date: "2026-10-06",
        amount: "-15",
        description: "concurrent",
        reference: "REF6",
      };
      const results = await Promise.allSettled([
        importStatement(bank.id, [concurrentRow], [""], "doc5"),
        importStatement(bank.id, [concurrentRow], [""], "doc5"),
      ]);
      assert.ok(results.some((r) => r.status === "fulfilled"));
      assert.equal(
        await prisma.transaction.count({
          where: { description: "concurrent" },
        }),
        1,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
