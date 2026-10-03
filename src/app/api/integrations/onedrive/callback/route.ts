import { employeeCookie, finishEmployeeLogin } from "@/lib/personnel/session";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { finishConnection } from "@/lib/onedrive/connection";
import { cookieOptions, oauthCookie, sessionCookie, seal, unseal } from "@/lib/onedrive/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const jar = await cookies();
  const target = new URL("/evraklar", process.env.ONEDRIVE_REDIRECT_URI || request.url);
  try {
    const url = new URL(request.url);
    const raw = jar.get(oauthCookie)?.value;
    jar.delete(oauthCookie);
    if (raw) {
      try { if (unseal<{ employee?: boolean }>(raw, "oauth").employee) target.pathname = "/evraklarim"; } catch { /* Invalid state never authenticates. */ }
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!raw || !code || !state || url.searchParams.has("error")) throw new Error("OAuth callback rejected");
    const expected = unseal<{ state: string; verifier: string; expiresAt: number; mail?: boolean; employee?: boolean; returnTo?: string }>(raw, "oauth");
    if (expected.expiresAt < Date.now() || state.length !== expected.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected.state))) throw new Error("OAuth state rejected");
    if(expected.mail) target.pathname = expected.returnTo === "/evraklar" ? "/evraklar" : "/satin-alma";
    if (expected.employee) {
      target.pathname = "/evraklarim";
      const employee = await finishEmployeeLogin(code, expected.verifier);
      jar.delete(sessionCookie);
      jar.set(employeeCookie, seal(employee, "employee-session"), cookieOptions(target.origin, 8 * 60 * 60));
    } else {
    const account = await finishConnection(code, expected.verifier,expected.mail === true);
    jar.set(sessionCookie, seal({ ...account, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }, "session"), cookieOptions(target.origin, 8 * 60 * 60));
    jar.delete(employeeCookie);
    }
    target.searchParams.set("connection", "success");
  } catch { target.searchParams.set("connection", "failed"); }
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
