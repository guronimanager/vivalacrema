import { publicDocument, syncDocument } from "@/lib/onedrive/documents";
import { ArchiveError, assertOrigin, failure, requireSession } from "@/lib/onedrive/security";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await request.json() as { id?: string };
    if (typeof body.id !== "string") throw new ArchiveError("Belge kimliği eksik.");
    return Response.json({ success: true, document: publicDocument(await syncDocument(body.id, current.accountId)) });
  } catch (error) { return failure(error); }
}
