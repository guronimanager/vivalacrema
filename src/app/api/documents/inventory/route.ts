import { requirePortal } from "@/lib/users/auth";
import {
  assertOrigin,
  failure,
  requireSession,
  ArchiveError,
} from "@/lib/onedrive/security";
import { scanArchive, registerRemoteDocument } from "@/lib/onedrive/inventory";
import { publicDocument } from "@/lib/onedrive/documents";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    await requirePortal("archive", true);
    const current = await requireSession();
    const body = await request.json();
    if (body.action === "scan")
      return Response.json(
        {
          success: true,
          ...(await scanArchive(
            current.accountId,
            body.period,
            body.folder,
            typeof body.cursor === "string" ? body.cursor : undefined,
            body.subpath ?? "",
          )),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (body.action !== "register" || typeof body.itemId !== "string")
      throw new ArchiveError("Tarama işlemini seçin.");
    const result = await registerRemoteDocument(
      current.accountId,
      body.period,
      body.folder,
      body.itemId,
      body.subpath ?? "",
    );
    return Response.json(
      {
        success: true,
        duplicate: result.duplicate,
        document: publicDocument(result.document),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
