import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const event = await request.json();

    if (
      event?.event_entity !== "transaction" ||
      event?.event_type !== "create"
    ) {
      return Response.json({
        success: true,
        ignored: true,
      });
    }

    const payload = event.payload;

    if (!payload?.id) {
      return Response.json(
        {
          success: false,
          message: "Transaction ID eksik.",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.sale.findFirst({
      where: {
        source: "tillhub",
        externalId: payload.id,
      },
    });

    if (existing) {
      return Response.json({
        success: true,
        duplicate: true,
      });
    }

    const business = await prisma.business.findFirst();

    if (!business) {
      return Response.json(
        {
          success: false,
          message: "Business bulunamadı.",
        },
        { status: 500 }
      );
    }

    const total = Number(
      payload.total_amount ??
      payload.total ??
      0
    );

    const paymentMethod =
      payload.payment_method ??
      "unknown";

    let cash = 0;
    let card = 0;
    let online = 0;

    if (paymentMethod === "cash") {
      cash = total;
    } else if (paymentMethod === "card") {
      card = total;
    } else {
      online = total;
    }

    const sale = await prisma.sale.create({
      data: {
        businessId: business.id,
        date: payload.created_at
          ? new Date(payload.created_at)
          : new Date(event.timestamp),

        cash,
        card,
        online,
        total,

        source: "tillhub",
        externalId: payload.id,
      },
    });

    return Response.json({
      success: true,
      saleId: sale.id,
      externalId: payload.id,
    });
  } catch (error) {
    console.error("TillHub webhook error:", error);

    return Response.json(
      {
        success: false,
        message: "Webhook işlenemedi.",
      },
      { status: 500 }
    );
  }
}
