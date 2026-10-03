import { ensureEmployeeIdentity } from "@/lib/personnel/clerk";
import { requirePortal } from "@/lib/users/auth";
import { validPermissions, defaults } from "@/lib/users/permissions";
import { prisma } from "@/lib/prisma";
import { assertOrigin, allowedEmail } from "@/lib/onedrive/security";
import { InputError, readInput, text, flag } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await requirePortal("users", true);
    const business = await prisma.business.findFirst();
    const records = business
      ? await prisma.portalUser.findMany({
          where: { businessId: business.id },
          include: { employee: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        })
      : [];
    return Response.json(
      { success: true, records, currentEmail: current.email },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return invoiceFailure(e);
  }
}
async function save(request: Request, update: boolean) {
  try {
    assertOrigin(request);
    await requirePortal("users", true);
    const body = await readInput(request),
      name = text(body, "name", true),
      email = text(body, "email", true).toLowerCase(),
      role = text(body, "role", true),
      employeeId = text(body, "employeeId") || null;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      name.length > 120 ||
      !["ADMIN", "ACCOUNTANT", "STAFF"].includes(role)
    )
      throw new InputError("Ad, e-posta ve rolü kontrol edin.");
    const business = await prisma.business.findFirst();
    if (!business) throw new InputError("İşletme bulunamadı.");
    if (
      employeeId &&
      !(await prisma.employee.findFirst({
        where: { id: employeeId, businessId: business.id },
      }))
    )
      throw new InputError("Personel bulunamadı.");
    if (email === allowedEmail()) throw new InputError("İşletme sahibinin kurtarma erişimi bu ekrandan değiştirilemez.");
    const enabled = body.accessEnabled !== undefined ? flag(body, "accessEnabled", false) : flag(body, "documentAccess", false);
    if (body.accessEnabled === undefined && enabled && role !== "STAFF") throw new InputError("Personel evrak onayı için Personel rolünü seçin.");
    if (enabled && role === "STAFF" && !employeeId) throw new InputError("Evrak erişimi için Personel rolünü ve personel kaydını seçin.");
    if (enabled && role === "STAFF" && !(await prisma.employee.findFirst({ where: { id: employeeId!, businessId: business.id, active: true } }))) throw new InputError("Pasif personele evrak erişimi verilemez.");
    let permissions;
    try { permissions = body.permissions === undefined ? undefined : validPermissions(body.permissions); }
    catch { throw new InputError("Sayfa yetkilerini kontrol edin."); }
    if (role !== "ADMIN" && permissions?.users) throw new InputError("Kullanıcı yönetimi yalnızca yöneticilere verilebilir.");
    const data = { name, email, role, employeeId, accessState: enabled ? "ACTIVE" : "PLANNED", ...(permissions ? { permissions } : {}) };
    if (update) {
      const id = text(body, "id", true);
      const existing = await prisma.portalUser.findFirst({ where: { id, businessId: business.id } });
      if (!existing) throw new InputError("Kullanıcı bulunamadı.");
      if (body.accessEnabled === undefined && existing.role !== "STAFF") throw new InputError("Bu rolün giriş ve yetkilerini Kullanıcılar sayfasından yönetin.");
      if (existing.email === allowedEmail() || email === allowedEmail()) throw new InputError("İşletme sahibinin kurtarma erişimi bu ekrandan değiştirilemez.");
      if (enabled) await ensureEmployeeIdentity(email);
      return Response.json({
        success: true,
        record: await prisma.portalUser.update({ where: { id }, data }),
      });
    }
    if (enabled) await ensureEmployeeIdentity(email);
    return Response.json({
      success: true,
      record: await prisma.portalUser.create({
        data: { ...data, permissions: permissions || defaults(role), businessId: business.id },
      }),
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
