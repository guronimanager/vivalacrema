import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const target = process.env.INVOICE_TEST_DATABASE_URL;
test(
  "invoice duplicates, concurrent settlement and bank reconciliation in isolated PostgreSQL",
  { skip: !target },
  async () => {
    const url = new URL(target);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "55439");
    assert.equal(url.username, "vlc_test");
    const prisma = new PrismaClient({ datasources: { db: { url: target } } });
    const { saveInvoice, savePayment, listInvoices } = loadTypeScript(
      "src/lib/invoices/service.ts",
      { "@/lib/prisma": { prisma } },
    );
    try {
      const business = await prisma.business.create({
        data: { name: "LOCAL TEST ONLY" },
      });
      const base = {
        supplierName: "Test Supplier",
        invoiceNumber: "TEST-1",
        date: "2026-10-02",
        dueDate: "2026-10-10",
        totalAmount: "119",
        netAmount: "100",
        vatAmount: "19",
        documentId: "a".repeat(64),
        kind: "INVOICE_MATERIAL",
        category: "Hammadde",
      };
      const invoice = await saveInvoice(base, "test-owner");
      await assert.rejects(saveInvoice(base, "test-owner"));
      await assert.rejects(
        saveInvoice(
          {
            ...base,
            documentId: "b".repeat(64),
            supplierName: "TEST  SUPPLIER",
          },
          "test-owner",
        ),
      );
      assert.equal(await prisma.expense.count(), 1);
      assert.equal(await prisma.supplier.count(), 1);
      const second = await saveInvoice(
        { ...base, documentId: "b".repeat(64), invoiceNumber: "TEST-2" },
        "test-owner",
      );
      assert.equal(await prisma.supplier.count(), 1);
      const request = {
        invoiceId: invoice.id,
        amount: "50",
        date: "2026-10-02",
        method: "BANK",
        requestId: randomUUID(),
      };
      const manual = await savePayment(request, "test-owner");
      assert.equal((await savePayment(request, "test-owner")).id, manual.id);
      assert.equal(await prisma.invoicePayment.count(), 1);
      await assert.rejects(
        savePayment(
          { ...request, requestId: randomUUID(), amount: "70" },
          "test-owner",
        ),
      );
      await assert.rejects(
        savePayment({ ...request, requestId: randomUUID() }, "different-owner"),
      );
      const concurrent = await Promise.allSettled([
        savePayment(
          { ...request, amount: "60", method: "CASH", requestId: randomUUID() },
          "test-owner",
        ),
        savePayment(
          { ...request, amount: "60", method: "CASH", requestId: randomUUID() },
          "test-owner",
        ),
      ]);
      assert.equal(
        concurrent.filter((r) => r.status === "fulfilled").length,
        1,
      );
      const account = await prisma.bankAccount.create({
        data: {
          businessId: business.id,
          name: "LOCAL BANK",
          type: "BANK",
          balance: "1000",
        },
      });
      const bank = await prisma.transaction.create({
        data: {
          businessId: business.id,
          bankAccountId: account.id,
          date: new Date("2026-10-02"),
          type: "EXPENSE",
          amount: "50",
        },
      });
      await assert.rejects(
        savePayment(
          { ...request, requestId: randomUUID(), transactionId: bank.id },
          "test-owner",
        ),
      );
      const matched = await savePayment(
        {
          ...request,
          paymentId: manual.id,
          transactionId: bank.id,
          requestId: randomUUID(),
        },
        "test-owner",
      );
      assert.equal(matched.id, manual.id);
      assert.equal(matched.transactionId, bank.id);
      assert.equal(
        (
          await savePayment(
            {
              ...request,
              paymentId: manual.id,
              transactionId: bank.id,
              requestId: randomUUID(),
            },
            "test-owner",
          )
        ).id,
        manual.id,
      );
      assert.equal(await prisma.invoicePayment.count(), 2);
      await assert.rejects(
        savePayment(
          {
            ...request,
            invoiceId: second.id,
            transactionId: bank.id,
            requestId: randomUUID(),
          },
          "test-owner",
        ),
      );
      const ledger = await listInvoices("test-owner");
      const tracked = ledger.find((i) => i.id === invoice.id);
      assert.equal(tracked.paidAmount, 110);
      assert.equal(tracked.outstandingAmount, 9);
      assert.equal(tracked.status, "PARTIAL");
      await savePayment(
        { ...request, amount: "9", method: "CASH", requestId: randomUUID() },
        "test-owner",
      );
      assert.equal(
        (await listInvoices("test-owner")).find((i) => i.id === invoice.id)
          .status,
        "PAID",
      );
      assert.equal(
        (
          await prisma.bankAccount.findUnique({ where: { id: account.id } })
        ).balance.toString(),
        "1000",
      );
      assert.equal(await prisma.expense.count(), 2);
      assert.equal(await prisma.transaction.count(), 1);
      assert.deepEqual(await listInvoices("different-owner"), []);
      const priorExpense = await prisma.expense.create({
        data: {
          businessId: business.id,
          date: new Date("2026-10-02"),
          category: "Hammadde",
          amount: "119",
          description: "Previously entered manually",
        },
      });
      await saveInvoice(
        {
          ...base,
          documentId: "c".repeat(64),
          invoiceNumber: "TEST-3",
          existingExpenseId: priorExpense.id,
        },
        "test-owner",
      );
      assert.equal(await prisma.expense.count(), 3);
      await assert.rejects(
        saveInvoice(
          {
            ...base,
            documentId: "d".repeat(64),
            invoiceNumber: "TEST-4",
            existingExpenseId: priorExpense.id,
          },
          "test-owner",
        ),
      );
      assert.equal(await prisma.expense.count(), 3);
    } finally {
      await prisma.$disconnect();
    }
  },
);
