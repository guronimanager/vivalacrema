import { Prisma } from "@prisma/client";
import {
  amount,
  InputError,
  optionalDate,
  text,
  type Input,
} from "@/lib/record-input";
export const expenseCategories = [
  "Hammadde",
  "Personel",
  "Kira",
  "Elektrik",
  "Su",
  "Doğalgaz",
  "İnternet",
  "Vergi",
  "Muhasebe",
  "Temizlik",
  "Bakım",
  "Diğer",
] as const;
export function supplierIdentity(name: string, taxNumber?: string | null) {
  if (taxNumber?.trim())
    return `tax:${taxNumber.replace(/\s/g, "").toUpperCase()}`;
  return `name:${name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")}`;
}
export function invoiceInput(body: Input) {
  const supplierName = text(body, "supplierName", true);
  if (supplierName.length > 120 || supplierIdentity(supplierName) === "name:")
    throw new InputError(
      "Geçerli tedarikçi adı girin (en fazla 120 karakter).",
    );
  const taxNumber = text(body, "taxNumber") || null;
  const invoiceNumber = text(body, "invoiceNumber", true).toUpperCase();
  const date = optionalDate(body, "date");
  const dueDate = optionalDate(body, "dueDate");
  if (!date || (dueDate && dueDate < date))
    throw new InputError(
      "Fatura tarihi zorunludur; vade tarihi fatura tarihinden önce olamaz.",
    );
  const totalAmount = amount(body, "totalAmount");
  if (totalAmount.lte(0))
    throw new InputError("Fatura tutarı sıfırdan büyük olmalıdır.");
  const optionalAmount = (key: string) =>
    body[key] == null || body[key] === "" ? null : amount(body, key);
  const netAmount = optionalAmount("netAmount");
  const vatAmount = optionalAmount("vatAmount");
  if (
    netAmount !== null &&
    vatAmount !== null &&
    netAmount.plus(vatAmount).minus(totalAmount).abs().gt("0.01")
  )
    throw new InputError("Net tutar + KDV, brüt toplamla uyuşmuyor.");
  if (netAmount?.gt(totalAmount) || vatAmount?.gt(totalAmount))
    throw new InputError("Net veya KDV tutarı brüt toplamı aşamaz.");
  const kind = text(body, "kind", true);
  if (!["INVOICE_SERVICE", "INVOICE_MATERIAL"].includes(kind))
    throw new InputError("Hizmet veya malzeme faturası seçin.");
  const category = text(body, "category", true);
  if (!(expenseCategories as readonly string[]).includes(category))
    throw new InputError("Geçerli gider kategorisi seçin.");
  const documentId = text(body, "documentId", true);
  if (!/^[a-f0-9]{64}$/.test(documentId))
    throw new InputError("Arşiv belgesi seçin.");
  return {
    supplierName,
    existingExpenseId: text(body, "existingExpenseId") || null,
    taxNumber,
    supplierKey: supplierIdentity(supplierName, taxNumber),
    invoiceNumber,
    date,
    dueDate,
    totalAmount,
    netAmount,
    vatAmount,
    kind,
    category,
    documentId,
    description: text(body, "description") || null,
  };
}
export function paymentState(
  total: Prisma.Decimal | string | number,
  payments: { amount: Prisma.Decimal | string | number }[],
  dueDate: Date | null,
  now = new Date(),
) {
  const paid = payments
    .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))
    .toDecimalPlaces(2);
  const remaining = new Prisma.Decimal(total).minus(paid).toDecimalPlaces(2);
  const status = remaining.lte(0) ? "PAID" : paid.gt(0) ? "PARTIAL" : "OPEN";
  const today = new Date(now.toISOString().slice(0, 10));
  return {
    paidAmount: paid.toNumber(),
    outstandingAmount: Prisma.Decimal.max(remaining, 0).toNumber(),
    status,
    overdue: remaining.gt(0) && Boolean(dueDate && dueDate < today),
  };
}
export function validatePayment(body: Input, outstanding: Prisma.Decimal) {
  const value = amount(body, "amount");
  if (value.lte(0) || value.gt(outstanding))
    throw new InputError(
      "Ödeme tutarı pozitif olmalı ve açık bakiyeyi aşmamalıdır.",
    );
  const date = optionalDate(body, "date");
  if (!date) throw new InputError("Ödeme tarihi zorunludur.");
  const method = text(body, "method", true);
  if (!["BANK", "CASH", "CARD"].includes(method))
    throw new InputError("Geçerli ödeme yöntemi seçin.");
  const requestId = text(body, "requestId", true);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      requestId,
    )
  )
    throw new InputError("Ödeme istek kimliği geçersiz.");
  return {
    amount: value,
    date,
    method,
    requestId,
    reference: text(body, "reference") || null,
    transactionId: text(body, "transactionId") || null,
  };
}
