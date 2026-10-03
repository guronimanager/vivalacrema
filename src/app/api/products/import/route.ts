import {
  assertOrigin,
  requireSession,
  ArchiveError,
} from "@/lib/onedrive/security";
import { readInput, text } from "@/lib/record-input";
import {
  readDocument,
  updatePendingDocument,
  syncDocument,
} from "@/lib/onedrive/documents";
import { invoiceFailure } from "@/lib/invoices/errors";
import { validateMetadata } from "@/lib/document-format";
import { prisma } from "@/lib/prisma";
import { importCatalog } from "@/lib/catalog/service";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const session = await requireSession();
    const body = await readInput(request);
    const { document } = await readDocument(
      text(body, "documentId", true),
      session.accountId,
    );
    if (document.kind !== "INVOICE_MATERIAL" || body.confirmed !== true)
      throw new ArchiveError(
        "Malzeme faturası ve onaylanmış ürün satırları seçin.",
      );
    validateMetadata({ ...document, date: text(body, "documentDate", true) });
    const records = await importCatalog(body, session.accountId);
    const supplier = await prisma.supplier.findUnique({
      where: { id: text(body, "supplierId", true) },
    });
    await updatePendingDocument(
      document.id,
      {
        ...document,
        entity: supplier?.name || document.entity,
        date: text(body, "documentDate") || document.date,
      },
      session.accountId,
    );
    let syncStatus = "FAILED";
    try {
      syncStatus = (await syncDocument(document.id, session.accountId))
        .syncStatus;
    } catch {}
    return Response.json({ success: true, records, syncStatus });
  } catch (e) {
    return invoiceFailure(e);
  }
}
