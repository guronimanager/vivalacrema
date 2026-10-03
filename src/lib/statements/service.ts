import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/invoices/service";
import { InputError } from "@/lib/record-input";
import { validateRows, type StatementRow } from "./input";
const normalized = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}\p{N}]/gu, "");
export function rowIdentities(accountId: string, rows: StatementRow[]) {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const reference = /^(notprovided|nonref|noref|nichtangegeben)$/i.test(
      normalized(row.reference),
    )
      ? ""
      : normalized(row.reference);
    const key = JSON.stringify([
      accountId,
      row.date,
      row.amount,
      reference || normalized(row.description),
    ]);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return createHash("sha256").update(`${key}:${count}`).digest("hex");
  });
}
async function context(tx: Prisma.TransactionClient, bankAccountId: string) {
  const business = await tx.business.findFirst();
  const account =
    business &&
    (await tx.bankAccount.findFirst({
      where: { id: bankAccountId, businessId: business.id, type: "BANK" },
    }));
  if (!account) throw new InputError("Bir banka hesabı seçin.");
  return account;
}
function compatible(
  row: StatementRow,
  item: { date: Date; amount: Prisma.Decimal; type: string },
) {
  return (
    item.date.toISOString().slice(0, 10) === row.date &&
    item.amount.equals(new Prisma.Decimal(row.amount).abs()) &&
    (Number(row.amount) < 0
      ? item.type === "EXPENSE"
      : item.type === "INCOME" || item.type === "TRANSFER")
  );
}
export async function previewStatement(
  bankAccountId: string,
  input: unknown,
  accountId: string,
) {
  let rows: StatementRow[];
  try {
    rows = validateRows(input);
  } catch (error) {
    throw new InputError((error as Error).message);
  }
  const account = await context(prisma, bankAccountId);
  const transactions = await prisma.transaction.findMany({
    where: {
      bankAccountId,
      businessId: account.businessId,
      date: {
        gte: new Date(
          `${rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date)}T00:00:00Z`,
        ),
        lte: new Date(
          `${rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date)}T23:59:59.999Z`,
        ),
      },
    },
    include: { invoicePayment: true },
  });
  const identities = rowIdentities(bankAccountId, rows);
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { accountId, businessId: account.businessId },
    include: { supplier: true, payments: true },
  });
  return rows.map((row, index) => {
    const duplicate = transactions.find(
      (t) =>
        t.source === "bank_statement" && t.externalId === identities[index],
    );
    const candidates = transactions.filter(
      (t) => compatible(row, t) && t.id !== duplicate?.id,
    );
    const suggestions =
      Number(row.amount) < 0
        ? invoices
            .filter((invoice) => {
              const outstanding = invoice.payments.reduce(
                (sum, p) => sum.minus(p.amount),
                invoice.totalAmount,
              );
              const manual = invoice.payments.some(
                (p) =>
                  !p.transactionId &&
                  p.method === "BANK" &&
                  p.date.toISOString().slice(0, 10) === row.date &&
                  p.amount.equals(new Prisma.Decimal(row.amount).abs()),
              );
              return (
                manual || outstanding.gte(new Prisma.Decimal(row.amount).abs())
              );
            })
            .map((invoice) => {
              const manual = invoice.payments.find(
                (p) =>
                  !p.transactionId &&
                  p.method === "BANK" &&
                  p.date.toISOString().slice(0, 10) === row.date &&
                  p.amount.equals(new Prisma.Decimal(row.amount).abs()),
              );
              const text = normalized(`${row.description} ${row.reference}`);
              return {
                id: invoice.id,
                label: `${invoice.supplier.name} · ${invoice.invoiceNumber}`,
                remaining: invoice.payments
                  .reduce((s, p) => s.minus(p.amount), invoice.totalAmount)
                  .toNumber(),
                paymentId: manual?.id || null,
                strong:
                  normalized(invoice.invoiceNumber).length >= 4 &&
                  text.includes(normalized(invoice.invoiceNumber)),
              };
            })
            .sort((a, b) => Number(b.strong) - Number(a.strong))
        : [];
    return {
      ...row,
      externalId: identities[index],
      duplicateId: duplicate?.id || null,
      settled: !!duplicate?.invoicePayment,
      candidates: candidates.map((t) => ({
        id: t.id,
        description: t.description,
        source: t.source,
        settled: !!t.invoicePayment,
      })),
      suggestions,
    };
  });
}
export async function importStatement(
  bankAccountId: string,
  input: unknown,
  resolutions: unknown,
  documentId: string,
) {
  let rows: StatementRow[];
  try {
    rows = validateRows(input);
  } catch (error) {
    throw new InputError((error as Error).message);
  }
  if (
    !Array.isArray(resolutions) ||
    resolutions.length !== rows.length ||
    resolutions.some((r) => typeof r !== "string")
  )
    throw new InputError("Bütün hareketler için kayıt seçimini kontrol edin.");
  return serializable(async (tx) => {
    const account = await context(tx, bankAccountId);
    const identities = rowIdentities(bankAccountId, rows);
    const result = [];
    const createdIds = new Set<string>();
    const usedIds = new Set<string>();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const duplicate = await tx.transaction.findUnique({
        where: {
          source_externalId: {
            source: "bank_statement",
            externalId: identities[index],
          },
        },
        include: { invoicePayment: true },
      });
      if (duplicate) {
        result.push({
          id: duplicate.id,
          created: false,
          settled: !!duplicate.invoicePayment,
        });
        continue;
      }
      const possible = await tx.transaction.findMany({
        where: {
          bankAccountId,
          businessId: account.businessId,
          date: {
            gte: new Date(`${row.date}T00:00:00Z`),
            lte: new Date(`${row.date}T23:59:59.999Z`),
          },
          amount: new Prisma.Decimal(row.amount).abs(),
          type:
            Number(row.amount) < 0 ? "EXPENSE" : { in: ["INCOME", "TRANSFER"] },
        },
        include: { invoicePayment: true },
      });
      const candidates = possible.filter((t) => !createdIds.has(t.id));
      const choice = resolutions[index];
      if (choice && choice !== "NEW") {
        const existing = candidates.find((t) => t.id === choice);
        if (!existing)
          throw new InputError(
            `${index + 1}. hareketin mevcut banka kaydı uyuşmuyor.`,
          );
        if (usedIds.has(existing.id))
          throw new InputError(
            "Aynı banka kaydı birden fazla ekstre hareketi için seçilemez.",
          );
        usedIds.add(existing.id);
        result.push({
          id: existing.id,
          created: false,
          settled: !!existing.invoicePayment,
        });
        continue;
      }
      if (candidates.length && choice !== "NEW")
        throw new InputError(
          `${index + 1}. harekette aynı tarih/tutarda kayıt var. Mevcut kaydı seçin veya farklı bir hareket olduğunu onaylayın.`,
        );
      const transaction = await tx.transaction.create({
        data: {
          businessId: account.businessId,
          bankAccountId,
          date: new Date(`${row.date}T00:00:00Z`),
          amount: new Prisma.Decimal(row.amount).abs(),
          type:
            Number(row.amount) < 0
              ? "EXPENSE"
              : /\bsumup\b/i.test(`${row.description} ${row.reference}`)
                ? "TRANSFER"
                : "INCOME",
          category: "Ekstre mutabakatı",
          description: row.description || row.reference || "Banka ekstresi",
          source: "bank_statement",
          externalId: identities[index],
        },
      });
      // Historical statement evidence is not another expense, sales entry or balance increment.
      createdIds.add(transaction.id);
      usedIds.add(transaction.id);
      result.push({ id: transaction.id, created: true, settled: false });
    }
    return { transactions: result, documentId };
  });
}
