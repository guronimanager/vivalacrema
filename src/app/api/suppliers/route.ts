import { prisma } from "@/lib/prisma";
import { readInput, text, InputError, inputFailure } from "@/lib/record-input";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const business = await prisma.business.findFirst();
    const records = business
      ? await prisma.supplier.findMany({
          where: { businessId: business.id },
          orderBy: { name: "asc" },
        })
      : [];
    return Response.json({ success: true, records });
  } catch (error) {
    return inputFailure(error);
  }
}

async function save(request: Request, update: boolean) {
  try {
    const body = await readInput(request);
    const data = {
      name: text(body, "name", true),
      taxNumber: text(body, "taxNumber") || null,
      phone: text(body, "phone") || null,
      email: text(body, "email") || null,
    };
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      throw new InputError("Geçerli bir e-posta adresi girin.");
    const business = await prisma.business.findFirst();
    if (!business)
      return Response.json(
        { success: false, message: "İşletme bulunamadı." },
        { status: 404 },
      );
    if (update) {
      const id = text(body, "id", true);
      const existing = await prisma.supplier.findFirst({
        where: { id, businessId: business.id },
      });
      if (!existing)
        return Response.json(
          { success: false, message: "Kayıt bulunamadı." },
          { status: 404 },
        );
      const record = await prisma.supplier.update({ where: { id }, data });
      return Response.json({ success: true, record });
    }
    const record = await prisma.supplier.create({
      data: { ...data, businessId: business.id },
    });
    return Response.json({ success: true, record }, { status: 201 });
  } catch (error) {
    return inputFailure(error);
  }
}

export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
