import { findRemoteDuplicate } from "@/lib/onedrive/inventory";
export const maxDuration = 90;
import { requirePortal } from "@/lib/users/auth";
import {
  assertOrigin,
  failure,
  requireSession,
  ArchiveError,
} from "@/lib/onedrive/security";
import { readDocument, publicDocument } from "@/lib/onedrive/documents";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    await requirePortal("archive", true);
    const current = await requireSession();
    const { id, period, folder, size } = await request.json();
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
      throw new ArchiveError("Belge kimliği geçersiz.");
    try {
      return Response.json(
        {
          success: true,
          duplicate: true,
          document: publicDocument(
            (await readDocument(id, current.accountId)).document,
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (!(error instanceof ArchiveError) || error.status !== 404) throw error;
      const remote = await findRemoteDuplicate(
        current.accountId,
        period,
        folder,
        id,
        size,
      );
      return Response.json(
        remote
          ? { success: true, duplicate: true, document: publicDocument(remote) }
          : { success: true, duplicate: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    return failure(error);
  }
}
