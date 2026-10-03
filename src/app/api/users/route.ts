import { ensureEmployeeIdentity } from "@/lib/personnel/clerk";
import { prisma } from "@/lib/prisma";
import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { InputError, readInput, text, flag } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await requireSession();
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
    await requireSession();
    const body = await readInput(request),
      name = text(body, "name", true),
      email = text(body, "email", true).toLowerCase(),
      role = text(body, "role", true),
      employeeId = text(body, "employeeId") || null;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      name.length > 120 ||
      !["ADMIN", "STAFF"].includes(role)
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
    const enabled = flag(body, "documentAccess", false);
    if (enabled && (role !== "STAFF" || !employeeId)) throw new InputError("Evrak erişimi için Personel rolünü ve personel kaydını seçin.");
    if (enabled && !(await prisma.employee.findFirst({ where: { id: employeeId!, businessId: business.id, active: true } }))) throw new InputError("Pasif personele evrak erişimi verilemez.");
    const data = { name, email, role, employeeId, accessState: enabled ? "ACTIVE" : "PLANNED" };
    if (update) {
      const id = text(body, "id", true);
      if (
        !(await prisma.portalUser.findFirst({
          where: { id, businessId: business.id },
        }))
      )
        throw new InputError("Kullanıcı bulunamadı.");
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
        data: { ...data, businessId: business.id },
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
