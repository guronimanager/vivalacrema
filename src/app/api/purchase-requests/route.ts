import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { readInput } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
import { createRequest, listRequests } from "@/lib/procurement/service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await requireSession();
    return Response.json(
      {
        success: true,
        requests: await listRequests(current.accountId),
        creatorEmail: current.email,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return invoiceFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    return Response.json({
      success: true,
      request: await createRequest(
        await readInput(request),
        current.accountId,
        current.email,
      ),
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
