import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ArchiveError } from "@/lib/onedrive/security";
export async function ensureEmployeeIdentity(email: string) {
  if (!process.env.CLERK_SECRET_KEY) throw new ArchiveError("Personel e-posta doğrulaması henüz yapılandırılmadı.", 503);
  try {
    const client = await clerkClient();
    const matches = await client.users.getUserList({ emailAddress: [email], limit: 2 });
    if (!matches.data.length) await client.users.createUser({ emailAddress: [email], skipPasswordRequirement: true });
  } catch { throw new ArchiveError("Personel e-posta doğrulama hesabı hazırlanamadı. Bağlantıyı kontrol edin.", 502); }
}
export async function clerkEmployee() {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const identity = await currentUser();
  const address = identity?.emailAddresses.find(value => value.id === identity.primaryEmailAddressId);
  if (!address || address.verification?.status !== "verified") throw new ArchiveError("Giriş e-postası doğrulanmadı.", 403);
  const email = address.emailAddress.trim().toLowerCase();
  const business = await prisma.business.findFirst({ select: { id: true } });
  const profile = business && await prisma.portalUser.findFirst({ where: { businessId: business.id, email, role: "STAFF", accessState: "ACTIVE" }, include: { employee: { select: { id: true, name: true, active: true, businessId: true } } } });
  if (!profile?.employee?.active || profile.employee.businessId !== profile.businessId) throw new ArchiveError("Bu e-posta için yönetici onayı etkin değil. Yöneticinizle iletişime geçin.", 403);
  return { employeeId: profile.employee.id, name: profile.employee.name };
}
