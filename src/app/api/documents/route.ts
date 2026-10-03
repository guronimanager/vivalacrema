import { type DocumentMetadata } from "@/lib/document-format";
import {
  finalizeDocument,
  assignLegacyEmployeeDocument,
  listDocuments,
  publicDocument,
  syncDocument,
} from "@/lib/onedrive/documents";
import {
  ArchiveError,
  assertOrigin,
  failure,
  requireSession,
} from "@/lib/onedrive/security";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await requireSession();
    const documents = await listDocuments(current.accountId);
    return Response.json(
      { success: true, documents: documents.map(publicDocument) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = (await request.json()) as {
      pathname?: string;
      metadata?: DocumentMetadata;
      sync?: boolean;
    };
    if (typeof body.pathname !== "string" || !body.metadata)
      throw new ArchiveError("Belge bilgileri eksik.");
    const document = await finalizeDocument(
      body.pathname,
      body.metadata,
      current.accountId,
    );
    const synced =
      body.sync === false
        ? document
        : await syncDocument(document.id, current.accountId);
    return Response.json(
      { success: true, document: publicDocument(synced) },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const body = await request.json();
    if (typeof body?.id !== "string" || typeof body?.employeeId !== "string") return Response.json({ success: false, message: "Belge ve personel seçin." }, { status: 400 });
    const document = await assignLegacyEmployeeDocument(body.id, body.employeeId, current.accountId);
    return Response.json({ success: true, document: publicDocument(document) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
