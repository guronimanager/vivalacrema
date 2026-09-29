import { prisma } from "@/lib/prisma";
import {
  readInput,
  text,
  amount,
  flag,
  optionalDate,
  inputFailure,
} from "@/lib/record-input";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const business = await prisma.business.findFirst();
    const taxes = business
      ? await prisma.tax.findMany({
          where: { businessId: business.id },
          orderBy: [{ paid: "asc" }, { dueDate: "asc" }, { name: "asc" }],
        })
      : [];
    return Response.json({
      success: true,
      records: taxes.map((tax) => ({
        ...tax,
        amount: Number(tax.amount.toFixed(2)),
      })),
    });
  } catch (error) {
    return inputFailure(error);
  }
}

async function save(request: Request, update: boolean) {
  try {
    const body = await readInput(request);
    const data = {
      name: text(body, "name", true),
      period: text(body, "period") || null,
      amount: amount(body, "amount"),
      dueDate: optionalDate(body, "dueDate"),
      paid: flag(body, "paid", false),
    };
    const business = await prisma.business.findFirst();
    if (!business)
      return Response.json(
        { success: false, message: "İşletme bulunamadı." },
        { status: 404 },
      );
    if (update) {
      const id = text(body, "id", true);
      const existing = await prisma.tax.findFirst({
        where: { id, businessId: business.id },
      });
      if (!existing)
        return Response.json(
          { success: false, message: "Kayıt bulunamadı." },
          { status: 404 },
        );
      const record = await prisma.tax.update({ where: { id }, data });
      return Response.json({
        success: true,
        record: { ...record, amount: Number(record.amount.toFixed(2)) },
      });
    }
    const record = await prisma.tax.create({
      data: { ...data, businessId: business.id },
    });
    return Response.json(
      {
        success: true,
        record: { ...record, amount: Number(record.amount.toFixed(2)) },
      },
      { status: 201 },
    );
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
