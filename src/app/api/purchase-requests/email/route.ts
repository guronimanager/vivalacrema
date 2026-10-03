import {
  assertOrigin,
  requireSession,
  ArchiveError,
} from "@/lib/onedrive/security";
import { readInput, text } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
import { sendRequestEmail } from "@/lib/procurement/email";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await readInput(request);
    if (body.confirmed !== true)
      throw new ArchiveError("Alıcı, talep metni ve PDF ekini onaylayın.");
    return Response.json({
      success: true,
      ...(await sendRequestEmail(
        text(body, "id", true),
        current.accountId,
        current.email,
        text(body, "expectedRecipient", true),
      )),
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
