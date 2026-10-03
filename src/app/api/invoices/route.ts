import { validateMetadata } from "@/lib/document-format";
import { prisma } from "@/lib/prisma";
import { readInput } from "@/lib/record-input";
import {
  assertOrigin,
  ArchiveError,
  requireSession,
} from "@/lib/onedrive/security";
import {
  readDocument,
  syncDocument,
  updatePendingDocument,
} from "@/lib/onedrive/documents";
import { invoiceInput } from "@/lib/invoices/input";
import { listInvoices, saveInvoice } from "@/lib/invoices/service";
import { invoiceFailure } from "@/lib/invoices/errors";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await requireSession();
    const invoices = await listInvoices(current.accountId);
    const business = await prisma.business.findFirst();
    const unlinked = business
      ? await prisma.expense.findMany({
          where: { businessId: business.id, invoice: null },
          orderBy: { date: "desc" },
          take: 200,
        })
      : [];
    return Response.json(
      {
        success: true,
        invoices,
        unlinkedExpenses: unlinked.map((expense) => ({
          id: expense.id,
          date: expense.date.toISOString().slice(0, 10),
          amount: expense.amount.toNumber(),
          category: expense.category,
          description: expense.description,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    if (typeof body.documentId !== "string")
      throw new ArchiveError("Arşiv belgesi seçin.");
    const { document } = await readDocument(body.documentId, current.accountId);
    if (!["INVOICE_SERVICE", "INVOICE_MATERIAL"].includes(document.kind))
      throw new ArchiveError("Bir fatura belgesi seçin.");
    const confirmed = invoiceInput(body);
    let metadata;
    try {
      metadata = validateMetadata({
        ...document,
        ...(body.archiveFolder !== undefined ? { archiveFolder: body.archiveFolder } : {}),
        ...(body.archivePeriod !== undefined ? { archivePeriod: body.archivePeriod } : {}),
        kind: confirmed.kind,
        entity: confirmed.supplierName,
        date: confirmed.date.toISOString().slice(0, 10),
      });
    } catch {
      throw new ArchiveError("Belge tarihi ve arşiv dönemini/klasörünü kontrol edin.");
    }
    await updatePendingDocument(document.id, metadata, current.accountId);
    const invoice = await saveInvoice(body, current.accountId);
    let syncStatus: "PENDING" | "SYNCED" | "FAILED" = "PENDING";
    try {
      syncStatus = (await syncDocument(document.id, current.accountId))
        .syncStatus;
    } catch {
      syncStatus = "FAILED";
    }
    return Response.json(
      { success: true, invoiceId: invoice.id, syncStatus },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
