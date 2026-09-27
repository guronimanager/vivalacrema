import { prisma } from "@/lib/prisma";
import { TransactionType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        bankAccount: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    return Response.json({
      success: true,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
        bankAccount: transaction.bankAccount
          ? {
              ...transaction.bankAccount,
              balance: Number(transaction.bankAccount.balance),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/bank-transactions:", error);

    return Response.json(
      {
        success: false,
        message: "Banka hareketleri alınamadı.",
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

    const bankAccountId = String(body?.bankAccountId ?? "").trim();
    const type = String(body?.type ?? "").trim() as TransactionType;
    const category = String(body?.category ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const amount = Number(body?.amount);

    if (!bankAccountId) {
      return Response.json(
        {
          success: false,
          message: "Banka hesabı zorunludur.",
        },
        { status: 400 }
      );
    }

    if (
      type !== TransactionType.INCOME &&
      type !== TransactionType.EXPENSE
    ) {
      return Response.json(
        {
          success: false,
          message: "İşlem türü INCOME veya EXPENSE olmalıdır.",
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        {
          success: false,
          message: "Geçerli bir tutar girin.",
        },
        { status: 400 }
      );
    }

    const account = await prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        businessId: business.id,
      },
    });

    if (!account) {
      return Response.json(
        {
          success: false,
          message: "Banka hesabı bulunamadı.",
        },
        { status: 404 }
      );
    }

    const date = body?.date
      ? new Date(body.date)
      : new Date();

    if (Number.isNaN(date.getTime())) {
      return Response.json(
        {
          success: false,
          message: "Geçersiz tarih.",
        },
        { status: 400 }
      );
    }

    const balanceChange =
      type === TransactionType.INCOME
        ? amount
        : -amount;

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          businessId: business.id,
          bankAccountId,
          date,
          type,
          category: category || null,
          description: description || null,
          amount,
          source: "manual",
        },
      });

      const updatedAccount = await tx.bankAccount.update({
        where: {
          id: bankAccountId,
        },
        data: {
          balance: {
            increment: balanceChange,
          },
        },
      });

      return {
        transaction,
        updatedAccount,
      };
    });

    return Response.json(
      {
        success: true,
        transaction: {
          ...result.transaction,
          amount: Number(result.transaction.amount),
        },
        account: {
          ...result.updatedAccount,
          balance: Number(result.updatedAccount.balance),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/bank-transactions:", error);

    return Response.json(
      {
        success: false,
        message: "Banka hareketi kaydedilemedi.",
      },
      { status: 500 }
    );
  }
}
