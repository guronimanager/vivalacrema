import { readConnection } from "@/lib/onedrive/connection";
import { configured, failure, session } from "@/lib/onedrive/security";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await session();
    const connection = current ? await readConnection() : null;
    return Response.json({ success: true, configured: configured(), authenticated: Boolean(current), mailConnected: Boolean(current && connection?.accountId === current.accountId && connection?.mailEnabled), connected: Boolean(current && connection?.accountId === current.accountId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
