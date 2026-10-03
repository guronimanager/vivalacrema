import { listDocuments, readDocument } from "@/lib/onedrive/documents";
import { readConnection } from "@/lib/onedrive/connection";
import { allowedEmail, ArchiveError, failure } from "@/lib/onedrive/security";
import { requireEmployeeSession } from "@/lib/personnel/session";
import { belongsToEmployee, employeeDocument } from "@/lib/personnel/documents";
import { get } from "@vercel/blob";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const employee = await requireEmployeeSession();
    const connection = await readConnection();
    if (!connection || connection.email !== allowedEmail()) throw new ArchiveError("Evrak arşivi henüz bağlanmadı. Yöneticiyle iletişime geçin.", 503);
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null) {
      const { document } = await readDocument(id, connection.accountId);
      if (!belongsToEmployee(document, employee.employeeId)) throw new ArchiveError("Belge bulunamadı.", 404);
      const file = await get(document.pathname, { access: "private", useCache: false });
      if (!file || file.statusCode !== 200) throw new ArchiveError("Dosya bulunamadı.", 404);
      return new Response(file.stream, { headers: {
        "Content-Type": document.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      } });
    }
    const documents = (await listDocuments(connection.accountId)).filter(d => belongsToEmployee(d, employee.employeeId)).map(employeeDocument);
    return Response.json({ success: true, employee: { name: employee.name }, documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
