import { get } from "@vercel/blob";
import { documentFromMailTicket } from "@/lib/personnel/email";
import { ArchiveError, failure } from "@/lib/onedrive/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const document = await documentFromMailTicket(new URL(request.url).searchParams.get("ticket") || "");
    const file = await get(document.pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200) throw new ArchiveError("Evrak bulunamadı.", 404);
    return new Response(file.stream, { headers: { "Content-Type": document.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  } catch (error) { return failure(error); }
}
