import { clerkEmployee } from "./clerk";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { msal } from "@/lib/onedrive/connection";
import { ArchiveError, unseal } from "@/lib/onedrive/security";

export const employeeCookie = "vlc_employee_session";
export const employeeScopes = ["https://graph.microsoft.com/User.Read"];
interface EmployeeSession {
  userId: string; employeeId: string; email: string; accountId: string;
  version: string; expiresAt: number;
}
export async function activeEmployeeUser(userId: string) {
  const business = await prisma.business.findFirst({ select: { id: true } });
  const user = business && await prisma.portalUser.findFirst({
    where: { id: userId, businessId: business.id, role: "STAFF", accessState: "ACTIVE" },
    include: { employee: { select: { id: true, businessId: true, name: true, active: true } } },
  });
  if (!user?.employee?.active || user.employee.businessId !== user.businessId) throw new ArchiveError("Personel evrak erişimi etkin değil. Yöneticiyle iletişime geçin.", 403);
  return { ...user, employee: user.employee };
}
export async function requireEmployeeSession() {
  const verified = await clerkEmployee();
  if (verified) return verified;
  const raw = (await cookies()).get(employeeCookie)?.value;
  let value: EmployeeSession;
  try {
    value = unseal<EmployeeSession>(raw || "", "employee-session");
    if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || !value.userId || !value.accountId || !value.employeeId || !value.email || !value.version) throw new Error();
  } catch { throw new ArchiveError("Kendi evraklarınıza erişmek için onaylı e-posta adresinizle giriş yapın.", 401); }
  const user = await activeEmployeeUser(value.userId);
  if (user.email !== value.email || user.employeeId !== value.employeeId || user.updatedAt.toISOString() !== value.version) throw new ArchiveError("Erişim bilgileriniz değişti. Yeniden giriş yapın.", 401);
  return { employeeId: user.employee.id, name: user.employee.name };
}
export async function finishEmployeeLogin(code: string, verifier: string): Promise<EmployeeSession> {
  const result = await msal().acquireTokenByCode({ code, codeVerifier: verifier, redirectUri: process.env.ONEDRIVE_REDIRECT_URI!, scopes: employeeScopes });
  if (!result?.account) throw new ArchiveError("Microsoft hesabı doğrulanamadı.", 403);
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${result.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new ArchiveError("Microsoft hesabı doğrulanamadı.", 403);
  const profile = await response.json() as { mail?: string; userPrincipalName?: string };
  const emails = [profile.mail, profile.userPrincipalName, result.account.username]
    .filter((v): v is string => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).map(v => v.toLowerCase());
  const business = await prisma.business.findFirst({ select: { id: true } });
  const matches = business && await prisma.portalUser.findMany({ where: { businessId: business.id, email: { in: emails }, role: "STAFF", accessState: "ACTIVE" }, select: { id: true } });
  // A Microsoft account with aliases cannot silently choose between two staff records.
  if (!matches || matches.length !== 1) throw new ArchiveError("Bu hesabın personel evrak erişimi yok.", 403);
  const user = await activeEmployeeUser(matches[0].id);
  // Identity-only login: do not persist staff tokens or change the owner's OneDrive connection.
  return { userId: user.id, employeeId: user.employee.id, email: user.email, accountId: result.account.homeAccountId, version: user.updatedAt.toISOString(), expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
}
