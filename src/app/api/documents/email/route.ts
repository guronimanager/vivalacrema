import { sendEmployeeDocument } from "@/lib/personnel/email";
import { publicDocument } from "@/lib/onedrive/documents";
import { ArchiveError, assertOrigin, failure, requireSession } from "@/lib/onedrive/security";
export async function POST(request: Request) {
  try {
    assertOrigin(request); const current = await requireSession(); const body = await request.json();
    if (typeof body?.id !== "string" || typeof body?.recipient !== "string") throw new ArchiveError("Belge ve alıcı e-postasını kontrol edin.");
    return Response.json({ success: true, document: publicDocument(await sendEmployeeDocument(body.id, current.accountId, body.recipient)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
