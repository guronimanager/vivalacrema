import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { invoiceFailure } from "@/lib/invoices/errors";
import { prisma } from "@/lib/prisma";
import {
  readInput,
  text,
  amount,
  flag,
} from "@/lib/record-input";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const business = await prisma.business.findFirst();
    const employees = business
      ? await prisma.employee.findMany({
          where: { businessId: business.id },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        })
      : [];
    return Response.json({
      success: true,
      records: employees.map((employee) => ({
        ...employee,
        salary: Number(employee.salary.toFixed(2)),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return invoiceFailure(error);
  }
}

async function save(request: Request, update: boolean) {
  try {
    assertOrigin(request);
    await requireSession();
    const body = await readInput(request);
    const data = {
      name: text(body, "name", true),
      role: text(body, "role") || null,
      salary: amount(body, "salary"),
      active: flag(body, "active", true),
    };
    const business = await prisma.business.findFirst();
    if (!business)
      return Response.json(
        { success: false, message: "İşletme bulunamadı." },
        { status: 404 },
      );
    if (update) {
      const id = text(body, "id", true);
      const existing = await prisma.employee.findFirst({
        where: { id, businessId: business.id },
      });
      if (!existing)
        return Response.json(
          { success: false, message: "Kayıt bulunamadı." },
          { status: 404 },
        );
      const record = await prisma.employee.update({ where: { id }, data });
      return Response.json({
        success: true,
        record: { ...record, salary: Number(record.salary.toFixed(2)) },
      });
    }
    const record = await prisma.employee.create({
      data: { ...data, businessId: business.id },
    });
    return Response.json(
      {
        success: true,
        record: { ...record, salary: Number(record.salary.toFixed(2)) },
      },
      { status: 201 },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}

export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
