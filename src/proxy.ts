import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();
// Only staff document routes use Clerk; owner OneDrive and TillHub routes stay separate.
export const config = { matcher: ["/evraklarim/:path*", "/api/personnel/documents"] };
