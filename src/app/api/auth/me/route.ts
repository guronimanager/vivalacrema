import { requirePortal } from "@/lib/users/auth";
import {
  landing,
  modules,
  canAccess,
  type Module,
} from "@/lib/users/permissions";
import { failure } from "@/lib/onedrive/security";
export async function GET() {
  try {
    const user = await requirePortal();
    return Response.json(
      {
        success: true,
        user,
        landing: landing(user),
        pages: Object.entries(modules)
          .filter(([key]) => canAccess(user, key as Module))
          .map(([, value]) => value),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
