import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { readInput, text } from "@/lib/record-input";
import { validateMetadata } from "@/lib/document-format";
import { ArchiveError, assertOrigin, requireSession } from "@/lib/onedrive/security";
import { finalizeDocument, publicDocument } from "@/lib/onedrive/documents";
import { downloadDocument } from "@/lib/invoices/remote-document";
import { invoiceFailure } from "@/lib/invoices/errors";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    let metadata;
    try {
      metadata = validateMetadata({
        kind: body.kind ?? "INVOICE_MATERIAL",
        entity: "Fatura kontrolü bekliyor",
        date: body.date ?? new Date().toISOString().slice(0, 10),
        originalName: "baglantidan-belge.pdf",
        archiveFolder: body.archiveFolder ?? "02_Online_Rechnungen",
        ...(body.archivePeriod !== undefined ? { archivePeriod: body.archivePeriod } : {}),
      });
      if (!["INVOICE_SERVICE", "INVOICE_MATERIAL"].includes(metadata.kind))
        throw new Error("Fatura seçin.");
    } catch {
      throw new ArchiveError("Fatura türü, belge tarihi ve arşiv dönemini/klasörünü kontrol edin.");
    }
    const downloaded = await downloadDocument(text(body, "url", true));
    const extension =
      downloaded.contentType === "application/pdf"
        ? "pdf"
        : downloaded.contentType === "image/png"
          ? "png"
          : "jpg";
    metadata = { ...metadata, originalName: `baglantidan-belge.${extension}` };
    const file = await put(
      `documents/files/${randomUUID()}/${metadata.originalName}`,
      downloaded.content,
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: downloaded.contentType,
      },
    );
    const document = await finalizeDocument(
      file.pathname,
      metadata,
      current.accountId,
    );
    return Response.json(
      { success: true, document: publicDocument(document) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
