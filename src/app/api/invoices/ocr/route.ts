import { readInput, text } from "@/lib/record-input";
import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { extractInvoice } from "@/lib/invoices/ocr";
import { invoiceFailure } from "@/lib/invoices/errors";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    const result = await extractInvoice(
      text(body, "documentId", true),
      current.accountId,
    );
    return Response.json(
      { success: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
