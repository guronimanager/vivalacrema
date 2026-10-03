import { get } from "@vercel/blob";
import { readDocument } from "@/lib/onedrive/documents";
import { ArchiveError, failure, requireSession } from "@/lib/onedrive/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const current = await requireSession();
    const { document } = await readDocument(new URL(request.url).searchParams.get("id") || "", current.accountId);
    const file = await get(document.pathname, { access: "private" });
    if (!file || file.statusCode !== 200) throw new ArchiveError("Dosya bulunamadı.", 404);
    return new Response(file.stream, { headers: { "Content-Type": document.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return failure(error); }
}
