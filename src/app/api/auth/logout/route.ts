import { cookies } from "next/headers";
import { sessionCookie } from "@/lib/onedrive/security";
import { employeeCookie } from "@/lib/personnel/session";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ success: false }, { status: 403 });
  const jar = await cookies();
  jar.delete(sessionCookie);
  jar.delete(employeeCookie);
  return Response.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
