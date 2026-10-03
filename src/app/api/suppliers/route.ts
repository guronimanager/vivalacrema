import { validateMetadata } from "@/lib/document-format";
import { prisma } from "@/lib/prisma";
import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import {
  readDocument,
  updatePendingDocument,
  syncDocument,
} from "@/lib/onedrive/documents";
import { supplierIdentity } from "@/lib/invoices/input";
import { serializable } from "@/lib/invoices/service";
import { invoiceFailure } from "@/lib/invoices/errors";
import { readInput, text, InputError, inputFailure } from "@/lib/record-input";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const business = await prisma.business.findFirst();
    const records = business
      ? await prisma.supplier.findMany({
          where: { businessId: business.id },
          orderBy: { name: "asc" },
        })
      : [];
    return Response.json({ success: true, records });
  } catch (error) {
    return inputFailure(error);
  }
}

async function save(request: Request, update: boolean) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    const data = {
      name: text(body, "name", true),
      taxNumber: text(body, "taxNumber") || null,
      phone: text(body, "phone") || null,
      email: text(body, "email") || null,
    };
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      throw new InputError("Geçerli bir e-posta adresi girin.");
    const business = await prisma.business.findFirst();
    if (!business)
      return Response.json(
        { success: false, message: "İşletme bulunamadı." },
        { status: 404 },
      );
    if (update) {
      const id = text(body, "id", true);
      const existing = await prisma.supplier.findFirst({
        where: { id, businessId: business.id },
      });
      if (!existing)
        return Response.json(
          { success: false, message: "Kayıt bulunamadı." },
          { status: 404 },
        );
      const record = await prisma.supplier.update({ where: { id }, data });
      return Response.json({ success: true, record });
    }
    const documentId = text(body, "documentId");
    if (documentId) {
      const { document } = await readDocument(documentId, current.accountId);
      validateMetadata({ ...document, date: text(body, "documentDate", true) });
      if (
        !["INVOICE_SERVICE", "INVOICE_MATERIAL", "ACCOUNTING"].includes(
          document.kind,
        )
      )
        throw new InputError("Tedarikçiye ait bir fatura veya evrak seçin.");
    }
    const record = await serializable(async (tx) => {
      const suppliers = await tx.supplier.findMany({
        where: { businessId: business.id },
      });
      const matches = suppliers.filter(
        (s) =>
          supplierIdentity(s.name, s.taxNumber) ===
            supplierIdentity(data.name, data.taxNumber) ||
          (supplierIdentity(s.name) === supplierIdentity(data.name) &&
            (!s.taxNumber || !data.taxNumber)),
      );
      if (matches.length > 1)
        throw new InputError(
          "Birden fazla tedarikçi eşleşti; mevcut kayıtları kontrol edin.",
        );
      const invoice = documentId
        ? await tx.purchaseInvoice.findUnique({
            where: {
              businessId_documentId: { businessId: business.id, documentId },
            },
          })
        : null;
      if (
        invoice &&
        (!matches.some((s) => s.id === invoice.supplierId) ||
          invoice.accountId !== current.accountId)
      )
        throw new InputError(
          "Evrak başka bir tedarikçiye veya kullanıcıya bağlı.",
        );
      const existingDocument = documentId
        ? await tx.supplierDocument.findUnique({
            where: {
              businessId_documentId: { businessId: business.id, documentId },
            },
          })
        : null;
      if (existingDocument) {
        const existing = await tx.supplier.findUnique({
          where: { id: existingDocument.supplierId },
        });
        if (
          !existing ||
          supplierIdentity(existing.name) !== supplierIdentity(data.name)
        )
          throw new InputError("Evrak başka bir tedarikçiye bağlı.");
        return existing;
      }
      const supplier =
        matches[0] ||
        (await tx.supplier.create({
          data: { ...data, businessId: business.id },
        }));
      if (documentId)
        await tx.supplierDocument.create({
          data: {
            businessId: business.id,
            supplierId: supplier.id,
            documentId,
            accountId: current.accountId,
          },
        });
      return supplier;
    });
    let syncStatus;
    if (documentId) {
      const { document } = await readDocument(documentId, current.accountId);
      await updatePendingDocument(
        documentId,
        {
          ...document,
          entity: record.name,
          date: text(body, "documentDate", true),
        },
        current.accountId,
      );
      syncStatus = (await syncDocument(documentId, current.accountId))
        .syncStatus;
    }
    return Response.json(
      { success: true, record, syncStatus },
      { status: 201 },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}

export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
