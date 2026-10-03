import { employeeCookie } from "@/lib/personnel/session";
import { cookies } from "next/headers";
import { assertOrigin, failure, sessionCookie } from "@/lib/onedrive/security";
export async function POST(request: Request) {
  try { assertOrigin(request); const jar = await cookies(); jar.delete(sessionCookie); jar.delete(employeeCookie); return Response.json({ success: true }); }
  catch (error) { return failure(error); }
}
