import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/invoices/service";
import { InputError, text, type Input } from "@/lib/record-input";
import { productInput, decimal, prefixes } from "./input";
export async function nextSequence(
  tx: Prisma.TransactionClient,
  businessId: string,
  kind: string,
) {
  return (
    await tx.productCounter.upsert({
      where: { businessId_kind: { businessId, kind } },
      create: { businessId, kind, value: 1 },
      update: { value: { increment: 1 } },
    })
  ).value;
}
async function upsertProduct(
  tx: Prisma.TransactionClient,
  businessId: string,
  body: Input,
) {
  const input = productInput(body);
  const found = await tx.product.findUnique({
    where: { businessId_identity: { businessId, identity: input.identity } },
  });
  if (found) return found;
  const sequence = await nextSequence(tx, businessId, input.kind);
  return tx.product.create({
    data: {
      ...input,
      businessId,
      code: `VLC-${prefixes[input.kind]}-${String(sequence).padStart(6, "0")}`,
    },
  });
}
async function link(
  tx: Prisma.TransactionClient,
  businessId: string,
  productId: string,
  body: Input,
) {
  const supplierId = text(body, "supplierId", true);
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, businessId },
  });
  if (!supplier) throw new InputError("Tedarikçi bulunamadı.");
  const supplierCode = text(body, "supplierCode") || null;
  const unitPrice =
    body.unitPrice == null || body.unitPrice === ""
      ? null
      : decimal(body.unitPrice, 4, true);
  return tx.supplierProduct.upsert({
    where: { productId_supplierId: { productId, supplierId } },
    create: { productId, supplierId, supplierCode, unitPrice },
    update: { supplierCode, unitPrice },
  });
}
export async function saveProduct(body: Input) {
  return serializable(async (tx) => {
    const business = await tx.business.findFirst();
    if (!business) throw new InputError("İşletme bulunamadı.");
    const product = await upsertProduct(tx, business.id, body);
    if (body.supplierId) await link(tx, business.id, product.id, body);
    return product;
  });
}
export async function updateProduct(body: Input) {
  return serializable(async (tx) => {
    const business = await tx.business.findFirst();
    const id = text(body, "id", true);
    const current =
      business &&
      (await tx.product.findFirst({ where: { id, businessId: business.id } }));
    if (!current) throw new InputError("Ürün bulunamadı.");
    const input = productInput(body);
    if (input.kind !== current.kind || input.unit !== current.unit)
      throw new InputError(
        "Ürün koduna bağlı tür/birim değiştirilemez; yeni ürün oluşturun.",
      );
    if (body.active !== undefined && typeof body.active !== "boolean")
      throw new InputError("Ürün durumunu kontrol edin.");
    const product = await tx.product.update({
      where: { id },
      data: {
        ...input,
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      },
    });
    if (body.supplierId) await link(tx, current.businessId, id, body);
    return product;
  });
}
export async function importCatalog(body: Input, accountId: string) {
  const documentId = text(body, "documentId", true),
    supplierId = text(body, "supplierId", true);
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 200
  )
    throw new InputError("1–200 ürün satırı seçin.");
  const items = body.items as Input[];
  const numbers = items.map((row) => Number(row.lineNumber));
  if (
    numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 10000) ||
    new Set(numbers).size !== numbers.length
  )
    throw new InputError("Fatura satır numaraları benzersiz olmalıdır.");
  return serializable(async (tx) => {
    const business = await tx.business.findFirst();
    if (!business) throw new InputError("İşletme bulunamadı.");
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, businessId: business.id },
    });
    if (!supplier) throw new InputError("Tedarikçi bulunamadı.");
    const binding = await tx.supplierDocument.findUnique({
      where: { businessId_documentId: { businessId: business.id, documentId } },
    });
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { businessId_documentId: { businessId: business.id, documentId } },
    });
    if (
      (binding && binding.supplierId !== supplierId) ||
      (invoice && invoice.supplierId !== supplierId)
    )
      throw new InputError("Bu belge başka bir tedarikçiye bağlı.");
    const records = [];
    for (const row of items) {
      const input = productInput(row),
        quantity = decimal(row.quantity, 3),
        lineNumber = Number(row.lineNumber);
      const existing = await tx.catalogImportLine.findUnique({
        where: {
          businessId_documentId_lineNumber: {
            businessId: business.id,
            documentId,
            lineNumber,
          },
        },
        include: { product: true },
      });
      if (existing) {
        if (
          existing.supplierId !== supplierId ||
          existing.product.identity !== input.identity
        )
          throw new InputError(
            "Faturanın bu satırı farklı bir ürüne zaten aktarılmış.",
          );
        records.push({ productId: existing.productId, created: false });
        continue;
      }
      const product = await upsertProduct(tx, business.id, row);
      await link(tx, business.id, product.id, { ...row, supplierId });
      await tx.catalogImportLine.create({
        data: {
          businessId: business.id,
          accountId,
          documentId,
          lineNumber,
          supplierId,
          productId: product.id,
          quantity,
          unitPrice:
            row.unitPrice == null || row.unitPrice === ""
              ? null
              : decimal(row.unitPrice, 4, true),
        },
      });
      records.push({ productId: product.id, created: true });
    }
    if (!binding)
      await tx.supplierDocument.create({
        data: { businessId: business.id, supplierId, accountId, documentId },
      });
    return records;
  });
}
export async function listProducts() {
  const business = await prisma.business.findFirst();
  if (!business) return [];
  const records = await prisma.product.findMany({
    where: { businessId: business.id },
    include: {
      suppliers: {
        include: { supplier: { select: { id: true, name: true } } },
      },
    },
    orderBy: { code: "asc" },
  });
  return records.map((r) => ({
    ...r,
    suppliers: r.suppliers.map((s) => ({
      ...s,
      unitPrice: s.unitPrice?.toNumber() ?? null,
    })),
  }));
}
