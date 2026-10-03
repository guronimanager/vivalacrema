import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { readInput, text } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
import { extractCatalog } from "@/lib/catalog/ocr";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    return Response.json({
      success: true,
      result: await extractCatalog(
        text(body, "documentId", true),
        current.accountId,
      ),
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
