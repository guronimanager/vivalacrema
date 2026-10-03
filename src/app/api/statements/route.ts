import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { readInput } from "@/lib/record-input";
import {
  assertOrigin,
  ArchiveError,
  requireSession,
} from "@/lib/onedrive/security";
import { readDocument } from "@/lib/onedrive/documents";
import { invoiceFailure } from "@/lib/invoices/errors";
import {
  assertCsvAccount,
  csvRows,
  csvTable,
  type Columns,
} from "@/lib/statements/input";
import { extractStatement } from "@/lib/statements/ocr";
import { importStatement, previewStatement } from "@/lib/statements/service";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    if (
      typeof body.documentId !== "string" ||
      typeof body.bankAccountId !== "string"
    )
      throw new ArchiveError("Ekstre ve banka hesabını seçin.");
    const { document } = await readDocument(body.documentId, current.accountId);
    if (document.kind !== "BANK_STATEMENT")
      throw new ArchiveError("Banka ekstresi seçin.");
    if (body.action === "extract") {
      const extraction = await extractStatement(document.id, current.accountId);
      return Response.json(
        { success: true, ...extraction },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    let rows = body.rows;
    if (document.contentType === "text/csv") {
      if (document.size > 2_000_000)
        throw new ArchiveError("CSV en fazla 2 MB olabilir.");
      const file = await get(document.pathname, {
        access: "private",
        useCache: false,
      });
      if (!file || file.statusCode !== 200)
        throw new ArchiveError("CSV okunamadı.");
      const bytes = await new Response(file.stream).arrayBuffer();
      let text = new TextDecoder("utf-8").decode(bytes);
      if (text.includes("\uFFFD"))
        text = new TextDecoder("windows-1252").decode(bytes);
      const value = body.columns as Record<string, unknown> | undefined;
      if (
        !value ||
        !["date", "amount", "description", "reference", "direction"].every(
          (k) => Number.isInteger(value[k]) && Number(value[k]) >= -1,
        )
      )
        throw new ArchiveError("CSV sütunlarını seçin.");
      try {
        const table = csvTable(text);
        const bank = await prisma.bankAccount.findFirst({
          where: { id: body.bankAccountId, type: "BANK" },
        });
        assertCsvAccount(table, bank?.iban);
        rows = csvRows(table, value as unknown as Columns);
      } catch (error) {
        throw new ArchiveError((error as Error).message);
      }
    } else if (document.contentType !== "application/pdf")
      throw new ArchiveError("CSV veya PDF ekstre seçin.");
    if (body.action === "preview")
      return Response.json(
        {
          success: true,
          rows: await previewStatement(
            body.bankAccountId,
            rows,
            current.accountId,
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (body.action !== "import" || body.confirmed !== true)
      throw new ArchiveError("Ekstreyi inceleyip onaylayın.");
    const result = await importStatement(
      body.bankAccountId,
      rows,
      body.resolutions,
      document.id,
    );
    return Response.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
