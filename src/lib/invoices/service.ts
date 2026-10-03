import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { InputError, type Input } from "@/lib/record-input";
import {
  invoiceInput,
  paymentState,
  supplierIdentity,
  validatePayment,
} from "./input";

export async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 2
      )
        throw error;
    }
  }
}
export async function saveInvoice(body: Input, accountId: string) {
  const input = invoiceInput(body);
  return serializable(async (tx) => {
    const business = await tx.business.findFirst();
    if (!business) throw new InputError("İşletme bulunamadı.");
    const duplicate = await tx.purchaseInvoice.findFirst({
      where: {
        businessId: business.id,
        OR: [
          { documentId: input.documentId },
          {
            supplierKey: input.supplierKey,
            invoiceNumber: input.invoiceNumber,
          },
        ],
      },
    });
    if (duplicate)
      throw new InputError(
        "Bu belge veya tedarikçinin aynı numaralı faturası zaten kaydedilmiş.",
      );
    const suppliers = await tx.supplier.findMany({
      where: { businessId: business.id },
    });
    const exactTax = input.taxNumber
      ? suppliers.filter(
          (s) =>
            s.taxNumber &&
            supplierIdentity(s.name, s.taxNumber) === input.supplierKey,
        )
      : [];
    const nameMatches = suppliers.filter(
      (s) =>
        supplierIdentity(s.name) === supplierIdentity(input.supplierName) &&
        (!input.taxNumber ||
          !s.taxNumber ||
          supplierIdentity(s.name, s.taxNumber) === input.supplierKey),
    );
    const matches = exactTax.length ? exactTax : nameMatches;
    if (matches.length > 1)
      throw new InputError(
        "Birden fazla tedarikçi eşleşti; tedarikçi kayıtlarını kontrol edin.",
      );
    const supplier =
      matches[0] ||
      (await tx.supplier.create({
        data: {
          businessId: business.id,
          name: input.supplierName,
          taxNumber: input.taxNumber,
        },
      }));
    const catalogBinding = await tx.supplierDocument.findUnique({
      where: {
        businessId_documentId: {
          businessId: business.id,
          documentId: input.documentId,
        },
      },
    });
    if (
      catalogBinding &&
      (catalogBinding.supplierId !== supplier.id ||
        catalogBinding.accountId !== accountId)
    )
      throw new InputError(
        "Belge başka bir tedarikçiye veya kullanıcıya bağlı.",
      );
    // Supplier ID makes duplicate protection stable when a tax number is added later.
    const sameSupplierInvoice = await tx.purchaseInvoice.findFirst({
      where: { supplierId: supplier.id, invoiceNumber: input.invoiceNumber },
    });
    if (sameSupplierInvoice)
      throw new InputError(
        "Bu tedarikçinin aynı numaralı faturası zaten kayıtlı.",
      );
    let expense;
    if (input.existingExpenseId) {
      expense = await tx.expense.findFirst({
        where: {
          id: input.existingExpenseId,
          businessId: business.id,
          invoice: null,
        },
      });
      if (
        !expense ||
        !expense.amount.equals(input.totalAmount) ||
        expense.category !== input.category ||
        expense.date.toISOString().slice(0, 10) !==
          input.date.toISOString().slice(0, 10)
      )
        throw new InputError(
          "Seçilen giderin tutarı, tarihi veya kategorisi faturayla uyuşmuyor ya da gider başka bir faturaya bağlı.",
        );
    } else {
      expense = await tx.expense.create({
        data: {
          businessId: business.id,
          date: input.date,
          category: input.category,
          description:
            input.description || `${supplier.name} · ${input.invoiceNumber}`,
          amount: input.totalAmount,
          paymentType: null,
        },
      });
    }
    return tx.purchaseInvoice.create({
      data: {
        businessId: business.id,
        supplierId: supplier.id,
        supplierKey: input.supplierKey,
        accountId,
        expenseId: expense.id,
        documentId: input.documentId,
        invoiceNumber: input.invoiceNumber,
        date: input.date,
        dueDate: input.dueDate,
        kind: input.kind,
        description: input.description,
        totalAmount: input.totalAmount,
        netAmount: input.netAmount,
        vatAmount: input.vatAmount,
      },
    });
  });
}
export async function savePayment(body: Input, accountId: string) {
  if (typeof body.invoiceId !== "string") throw new InputError("Fatura seçin.");
  const invoiceId = body.invoiceId;
  return serializable(async (tx) => {
    const invoice = await tx.purchaseInvoice.findFirst({
      where: { id: invoiceId, accountId },
      include: { payments: true },
    });
    if (!invoice) throw new InputError("Fatura bulunamadı.");
    const repeated =
      typeof body.requestId === "string"
        ? await tx.invoicePayment.findUnique({
            where: { requestId: body.requestId },
          })
        : null;
    if (repeated) {
      if (repeated.invoiceId !== invoice.id)
        throw new InputError("Ödeme isteği başka bir faturaya ait.");
      return repeated;
    }
    if (typeof body.paymentId === "string" && body.paymentId) {
      const existing = invoice.payments.find((p) => p.id === body.paymentId);
      if (
        !existing ||
        existing.method !== "BANK" ||
        typeof body.transactionId !== "string"
      )
        throw new InputError("Eşleştirilecek manuel banka ödemesini seçin.");
      if (existing.transactionId === body.transactionId) return existing;
      if (existing.transactionId)
        throw new InputError(
          "Bu ödeme başka bir banka hareketiyle eşleştirilmiş.",
        );
      const bank = await tx.transaction.findFirst({
        where: {
          id: body.transactionId,
          businessId: invoice.businessId,
          type: "EXPENSE",
          bankAccount: { type: "BANK" },
          OR: [{ source: null }, { source: { not: "sumup" } }],
        },
        include: { invoicePayment: true },
      });
      if (
        !bank ||
        bank.invoicePayment ||
        !bank.amount.equals(existing.amount) ||
        bank.date.toISOString().slice(0, 10) !==
          existing.date.toISOString().slice(0, 10)
      )
        throw new InputError(
          "Banka tutarı/tarihi manuel ödemeyle uyuşmuyor veya hareket zaten eşleştirilmiş.",
        );
      return tx.invoicePayment.update({
        where: { id: existing.id },
        data: { transactionId: bank.id },
      });
    }
    const outstanding = invoice.payments.reduce(
      (sum, payment) => sum.minus(payment.amount),
      invoice.totalAmount,
    );
    const input = validatePayment(body, outstanding);
    if (input.transactionId) {
      if (
        invoice.payments.some(
          (p) =>
            !p.transactionId &&
            p.method === "BANK" &&
            p.amount.equals(input.amount) &&
            p.date.toISOString().slice(0, 10) ===
              input.date.toISOString().slice(0, 10),
        )
      )
        throw new InputError(
          "Aynı tarih ve tutarda manuel banka ödemesi var. Yeni ödeme eklemek yerine mevcut ödemeyi banka hareketiyle eşleştirin.",
        );
      const bank = await tx.transaction.findFirst({
        where: {
          id: input.transactionId,
          businessId: invoice.businessId,
          type: "EXPENSE",
          bankAccount: { type: "BANK" },
          OR: [{ source: null }, { source: { not: "sumup" } }],
        },
        include: { invoicePayment: true },
      });
      if (
        !bank ||
        bank.invoicePayment ||
        !bank.amount.equals(input.amount) ||
        input.method !== "BANK" ||
        bank.date.toISOString().slice(0, 10) !==
          input.date.toISOString().slice(0, 10)
      )
        throw new InputError(
          "Banka hareketi uygun değil, tutar/tarih uyuşmuyor veya zaten eşleştirilmiş.",
        );
    }
    // This is settlement tracking only: do not create another expense or alter bank balances.
    return tx.invoicePayment.create({
      data: { invoiceId: invoice.id, ...input },
    });
  });
}
export async function listInvoices(accountId: string) {
  const records = await prisma.purchaseInvoice.findMany({
    where: { accountId },
    include: {
      supplier: true,
      payments: { orderBy: { date: "desc" } },
      expense: { select: { category: true } },
    },
    orderBy: { date: "desc" },
  });
  return records.map((invoice) => ({
    id: invoice.id,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplier.name,
    invoiceNumber: invoice.invoiceNumber,
    documentId: invoice.documentId,
    date: invoice.date.toISOString().slice(0, 10),
    dueDate: invoice.dueDate?.toISOString().slice(0, 10) || null,
    category: invoice.expense.category,
    totalAmount: invoice.totalAmount.toNumber(),
    ...paymentState(invoice.totalAmount, invoice.payments, invoice.dueDate),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      date: payment.date.toISOString().slice(0, 10),
      amount: payment.amount.toNumber(),
      method: payment.method,
      reference: payment.reference,
      transactionId: payment.transactionId,
    })),
  }));
}
