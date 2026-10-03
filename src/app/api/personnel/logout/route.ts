import { cookies } from "next/headers";
import { employeeCookie } from "@/lib/personnel/session";
import { ArchiveError, failure } from "@/lib/onedrive/security";

export async function POST(request: Request) {
  try {
    // Staff use the portal host; owner OAuth keeps its existing callback host.
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      throw new ArchiveError("Bu isteğe izin verilmiyor.", 403);
    }
    (await cookies()).delete(employeeCookie);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
