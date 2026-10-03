import { requireSession } from "@/lib/onedrive/security";
import { invoiceFailure } from "@/lib/invoices/errors";
import { getRequest } from "@/lib/procurement/service";
import { requestPdf } from "@/lib/procurement/pdf";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const current = await requireSession();
    const record = await getRequest(
      new URL(request.url).searchParams.get("id") || "",
      current.accountId,
    );
    const pdf = await requestPdf(record);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${record.number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
