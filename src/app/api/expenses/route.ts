import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: {
        date: "desc",
      },
    });

    return Response.json({
      success: true,
      expenses: expenses.map((expense) => ({
        ...expense,
        amount: Number(expense.amount),
      })),
    });
  } catch (error) {
    console.error("GET /api/expenses:", error);

    return Response.json(
      {
        success: false,
        message: "Giderler alınamadı.",
      },
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
        {
          success: false,
          message: "İşletme bulunamadı.",
        },
        { status: 404 }
      );
    }

    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        {
          success: false,
          message: "Geçerli bir gider tutarı girin.",
        },
        { status: 400 }
      );
    }

    if (!body.category) {
      return Response.json(
        {
          success: false,
          message: "Gider kategorisi zorunludur.",
        },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.create({
      data: {
        businessId: business.id,
        date: body.date ? new Date(body.date) : new Date(),
        category: body.category,
        description: body.description ?? null,
        amount,
        paymentType: body.paymentType ?? null,
      },
    });

    return Response.json(
      {
        success: true,
        expense: {
          ...expense,
          amount: Number(expense.amount),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/expenses:", error);

    return Response.json(
      {
        success: false,
        message: "Gider kaydedilemedi.",
      },
      { status: 500 }
    );
  }
}
