import { cookies } from "next/headers";
import { assertOrigin, failure, sessionCookie } from "@/lib/onedrive/security";
export async function POST(request: Request) {
  try { assertOrigin(request); (await cookies()).delete(sessionCookie); return Response.json({ success: true }); }
  catch (error) { return failure(error); }
}
