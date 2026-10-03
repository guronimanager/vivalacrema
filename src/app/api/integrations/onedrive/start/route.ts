import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { msal, scopes, mailScopes } from "@/lib/onedrive/connection";
import { allowedEmail, cookieOptions, failure, oauthCookie, seal } from "@/lib/onedrive/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const mail = new URL(request.url).searchParams.get("mail") === "1";
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const redirectUri = process.env.ONEDRIVE_REDIRECT_URI!;
    const url = await msal().getAuthCodeUrl({ scopes: mail ? [...scopes,...mailScopes] : scopes, redirectUri, state, codeChallenge: createHash("sha256").update(verifier).digest("base64url"), codeChallengeMethod: "S256", prompt: "select_account", loginHint: allowedEmail() });
    (await cookies()).set(oauthCookie, seal({ state, verifier, mail, expiresAt: Date.now() + 10 * 60 * 1000 }, "oauth"), cookieOptions(redirectUri, 600));
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) { return failure(error); }
}
