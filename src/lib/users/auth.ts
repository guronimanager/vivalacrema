import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ArchiveError, allowedEmail, session } from "@/lib/onedrive/security";
import { canAccess, type Module, type Permissions } from "./permissions";
export interface PortalIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Permissions;
  employeeId: string | null;
}
export async function portalIdentity(proxy?: {
  userId: string | null;
  ownerCookie: string;
}): Promise<PortalIdentity | null> {
  const identity =
    proxy ?? (process.env.CLERK_SECRET_KEY ? await auth() : null);
  if (identity?.userId) {
    const user = proxy
      ? await (await clerkClient()).users.getUser(identity.userId)
      : await currentUser();
    const address = user?.emailAddresses.find(
      (value) => value.id === user.primaryEmailAddressId,
    );
    if (!address || address.verification?.status !== "verified")
      throw new ArchiveError("Giriş e-postası doğrulanmadı.", 403);
    const email = address.emailAddress.trim().toLowerCase();
    // The existing archive owner retains administrative recovery access.
    if (email === allowedEmail())
      return {
        id: "owner",
        email,
        name: "İşletme sahibi",
        role: "ADMIN",
        permissions: {},
        employeeId: null,
      };
    const business = await prisma.business.findFirst({ select: { id: true } });
    const profile =
      business &&
      (await prisma.portalUser.findFirst({
        where: { businessId: business.id, email, accessState: "ACTIVE" },
        include: { employee: { select: { active: true, businessId: true } } },
      }));
    if (
      !profile ||
      !["ADMIN", "ACCOUNTANT", "STAFF"].includes(profile.role) ||
      (profile.role === "STAFF" &&
        (!profile.employee?.active ||
          profile.employee.businessId !== profile.businessId))
    )
      throw new ArchiveError(
        "Kullanıcı erişiminiz kapalı. Yöneticinizle iletişime geçin.",
        403,
      );
    return {
      id: profile.id,
      name: profile.name,
      email,
      role: profile.role,
      permissions: profile.permissions as Permissions,
      employeeId: profile.employeeId,
    };
  }
  const owner = await session(proxy?.ownerCookie);
  return owner
    ? {
        id: "owner",
        email: owner.email,
        name: "İşletme sahibi",
        role: "ADMIN",
        permissions: {},
        employeeId: null,
      }
    : null;
}
export async function requirePortal(module?: Module, write = false) {
  const user = await portalIdentity();
  if (!user) throw new ArchiveError("E-posta adresinizle giriş yapın.", 401);
  if (module && !canAccess(user, module, write))
    throw new ArchiveError("Bu işlem için yetkiniz yok.", 403);
  return user;
}
