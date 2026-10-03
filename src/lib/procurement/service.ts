import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/invoices/service";
import { decimal } from "@/lib/catalog/input";
import { nextSequence } from "@/lib/catalog/service";
import { InputError, text, optionalDate, type Input } from "@/lib/record-input";
export async function createRequest(
  body: Input,
  accountId: string,
  email: string,
) {
  const supplierId = text(body, "supplierId", true),
    requestId = text(body, "requestId", true),
    date = optionalDate(body, "date"),
    requiredDate = optionalDate(body, "requiredDate"),
    notes = text(body, "notes");
  if (
    !/^[a-f0-9-]{36}$/i.test(requestId) ||
    !date ||
    (requiredDate && requiredDate < date)
  )
    throw new InputError(
      "Talep tarihi, teslim tarihi ve istek kimliği geçerli olmalıdır.",
    );
  if (
    !Array.isArray(body.lines) ||
    !body.lines.length ||
    body.lines.length > 100
  )
    throw new InputError("1–100 ürün seçin.");
  const lines = body.lines as Input[];
  if (new Set(lines.map((l) => l.productId)).size !== lines.length)
    throw new InputError("Aynı ürünü iki satıra eklemeyin; miktarını artırın.");
  return serializable(async (tx) => {
    const repeated = await tx.purchaseRequest.findUnique({
      where: { requestId },
    });
    if (repeated) {
      if (repeated.accountId !== accountId)
        throw new InputError("İstek başka bir kullanıcıya ait.");
      return repeated;
    }
    const business = await tx.business.findFirst();
    if (!business) throw new InputError("İşletme bulunamadı.");
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, businessId: business.id },
    });
    if (!supplier) throw new InputError("Tedarikçi bulunamadı.");
    const snapshots = [];
    for (const line of lines) {
      const productId = text(line, "productId", true),
        quantity = decimal(line.quantity, 3);
      const product = await tx.product.findFirst({
        where: { id: productId, businessId: business.id, active: true },
        include: { suppliers: { where: { supplierId } } },
      });
      if (!product || !product.suppliers.length)
        throw new InputError(
          "Bütün ürünler seçilen tedarikçiye bağlı ve aktif olmalıdır.",
        );
      snapshots.push({
        productId,
        code: product.code,
        name: [product.brand, product.name, product.packSize]
          .filter(Boolean)
          .join(" · "),
        unit: product.unit,
        supplierCode: product.suppliers[0].supplierCode,
        unitPrice: product.suppliers[0].unitPrice,
        quantity,
      });
    }
    const year = date.getUTCFullYear(),
      sequence = await nextSequence(tx, business.id, `REQUEST-${year}`);
    return tx.purchaseRequest.create({
      data: {
        businessId: business.id,
        supplierId,
        accountId,
        creatorEmail: email,
        requestId,
        date,
        requiredDate,
        notes: notes || null,
        number: `VLC-TALEP-${year}-${String(sequence).padStart(6, "0")}`,
        lines: { create: snapshots },
      },
    });
  });
}
export async function getRequest(id: string, accountId: string) {
  const request = await prisma.purchaseRequest.findFirst({
    where: { id, accountId },
    include: { supplier: true, lines: { orderBy: { code: "asc" } } },
  });
  if (!request) throw new InputError("Talep bulunamadı.");
  return request;
}
export async function listRequests(accountId: string) {
  const records = await prisma.purchaseRequest.findMany({
    where: { accountId },
    include: { supplier: true, lines: { orderBy: { code: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return records.map((r) => ({
    ...r,
    message: requestMessage(r),
    lines: r.lines.map((l) => ({
      ...l,
      quantity: l.quantity.toNumber(),
      unitPrice: l.unitPrice?.toNumber() ?? null,
    })),
    estimatedNet: r.lines
      .reduce(
        (sum, l) => sum + (l.unitPrice?.mul(l.quantity).toNumber() || 0),
        0,
      )
      .toFixed(2),
  }));
}
export function requestMessage(request: {
  number: string;
  creatorEmail: string;
  requiredDate: Date | null;
  notes: string | null;
  lines: {
    code: string;
    name: string;
    unit: string;
    quantity: { toString(): string };
    supplierCode: string | null;
  }[];
}) {
  return `Guten Tag,\n\nbitte senden Sie uns ein Angebot und die Lieferverfügbarkeit für folgende Produkte.\nAnfrage: ${request.number}\n\n${request.lines.map((l) => `${l.code} | ${l.name} | ${l.quantity.toString()} ${({ ADET: "Stück", KG: "kg", LITRE: "l", KOLI: "Karton" } as Record<string, string>)[l.unit]}${l.supplierCode ? ` | Ihre Artikelnummer: ${l.supplierCode}` : ""}`).join("\n")}\n\n${request.requiredDate ? `Gewünschter Liefertermin: ${request.requiredDate.toISOString().slice(0, 10)}\n` : ""}${request.notes ? `${request.notes}\n` : ""}\nDies ist eine Angebotsanfrage, keine verbindliche Bestellung.\n\nViva La Crema\n${request.creatorEmail}`;
}
