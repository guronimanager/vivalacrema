import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/onedrive/security";
import { portalIdentity } from "@/lib/users/auth";
import { canAccess, moduleForPath } from "@/lib/users/permissions";
const publicPaths = [
  "/giris",
  "/yetkisiz",
  "/evraklarim",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/personnel/logout",
  "/api/personnel/documents",
  "/api/personnel/mail-download",
  "/api/integrations/onedrive/start",
  "/api/integrations/onedrive/callback",
  "/api/integrations/onedrive/logout",
];
export default clerkMiddleware(async (clerkAuth, request) => {
  const path = request.nextUrl.pathname;
  // Existing machine integrations and signed Blob callbacks keep their own validation.
  if (
    publicPaths.includes(path) ||
    path.startsWith("/api/integrations/tillhub/") ||
    path.startsWith("/api/integrations/sumup/")
  )
    return NextResponse.next();
  if (path === "/api/documents/upload" && request.method === "POST") {
    const body = await request
      .clone()
      .json()
      .catch(() => null);
    if (body?.type === "blob.upload-completed") return NextResponse.next();
  }
  try {
    const { userId } = await clerkAuth();
    const user = await portalIdentity({
      userId,
      ownerCookie: request.cookies.get(sessionCookie)?.value || "",
    });
    if (!user) {
      if (path.startsWith("/api/"))
        return NextResponse.json(
          { success: false, message: "Giriş yapmanız gerekiyor." },
          { status: 401 },
        );
      return NextResponse.redirect(new URL("/giris", request.url));
    }
    const area =
      moduleForPath(path) ||
      (path === "/api/integrations/onedrive/status" ? "archive" : null);
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (
      (!area && user.role !== "ADMIN") ||
      (area && !canAccess(user, area, write))
    ) {
      if (path.startsWith("/api/"))
        return NextResponse.json(
          { success: false, message: "Bu işlem için yetkiniz yok." },
          { status: 403 },
        );
      return NextResponse.redirect(new URL("/yetkisiz", request.url));
    }
    if (write && request.headers.get("origin") !== request.nextUrl.origin)
      return NextResponse.json(
        { success: false, message: "Bu isteğe izin verilmiyor." },
        { status: 403 },
      );
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    if (path.startsWith("/api/"))
      return NextResponse.json(
        {
          success: false,
          message: "Oturumunuz veya erişim yetkiniz doğrulanamadı.",
        },
        { status: 403 },
      );
    return NextResponse.redirect(new URL("/yetkisiz", request.url));
  }
});
export const config = {
  matcher: [
    "/((?!_next|favicon.ico|.*\\.(?:css|js|png|jpg|jpeg|svg|woff2?)$).*)",
    "/api/:path*",
  ],
};
