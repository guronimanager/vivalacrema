import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sales = await prisma.sale.findMany({
      orderBy: {
        date: "desc",
      },
    });

    return Response.json({
      success: true,
      sales: sales.map((sale) => ({
        ...sale,
        cash: Number(sale.cash),
        card: Number(sale.card),
        online: Number(sale.online),
        total: Number(sale.total),
      })),
    });
  } catch (error) {
    console.error("GET /api/sales:", error);

    return Response.json(
      { success: false, message: "Satışlar alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const business = await prisma.business.findFirst();

    if (!business) {
      return Response.json(
        { success: false, message: "İşletme bulunamadı." },
        { status: 404 }
      );
    }

    const cash = Number(body.cash ?? 0);
    const card = Number(body.card ?? 0);
    const online = Number(body.online ?? 0);

    if (
      !Number.isFinite(cash) ||
      !Number.isFinite(card) ||
      !Number.isFinite(online) ||
      cash < 0 ||
      card < 0 ||
      online < 0
    ) {
      return Response.json(
        { success: false, message: "Geçersiz satış tutarı." },
        { status: 400 }
      );
    }

    const total = cash + card + online;

    const sale = await prisma.sale.create({
      data: {
        businessId: business.id,
        date: body.date ? new Date(body.date) : new Date(),
        cash,
        card,
        online,
        total,
        source: body.source ?? "manual",
      },
    });

    return Response.json(
      {
        success: true,
        sale: {
          ...sale,
          cash: Number(sale.cash),
          card: Number(sale.card),
          online: Number(sale.online),
          total: Number(sale.total),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/sales:", error);

    return Response.json(
      { success: false, message: "Satış kaydedilemedi." },
      { status: 500 }
    );
  }
}
