import { prisma } from "@/lib/prisma";
import {
  AccountType,
  TransactionType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const nextMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

    const startDate = monthStart.toISOString().slice(0, 10);
    const endDate = nextMonthStart.toISOString().slice(0, 10);

    let tillhubData = {
      cashTotal: 0,
      cardTotal: 0,
      total: 0,
      cashCount: 0,
      cardCount: 0,
      paymentCount: 0,
    };

    let tillhubDaily: {
      date: string;
      revenue: number;
    }[] = [];

    try {
      const baseUrl = new URL(request.url).origin;

      const [paymentsResponse, transactionsResponse] =
        await Promise.all([
          fetch(
            `${baseUrl}/api/integrations/tillhub/payments-top?start=${startDate}&end=${endDate}`,
            { cache: "no-store" }
          ),
          fetch(
            `${baseUrl}/api/integrations/tillhub/transactions?start=${startDate}&end=${endDate}`,
            { cache: "no-store" }
          ),
        ]);

      if (paymentsResponse.ok) {
        const result = await paymentsResponse.json();

        tillhubData = {
          cashTotal: Number(result?.cashTotal ?? 0),
          cardTotal: Number(result?.cardTotal ?? 0),
          total: Number(result?.total ?? 0),
          cashCount: Number(result?.cashCount ?? 0),
          cardCount: Number(result?.cardCount ?? 0),
          paymentCount: Number(result?.paymentCount ?? 0),
        };
      }

      if (transactionsResponse.ok) {
        const result = await transactionsResponse.json();

        tillhubDaily = Array.isArray(result?.daily)
          ? result.daily
          : [];
      }
    } catch (error) {
      console.error("TillHub dashboard fetch error:", error);
    }

    const [
      expenses,
      bankAccounts,
      sumupFees,
    ] = await Promise.all([
      prisma.expense.findMany({
        where: {
          date: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        orderBy: {
          date: "asc",
        },
      }),

      prisma.bankAccount.findMany(),

      prisma.transaction.findMany({
        where: {
          date: {
            gte: monthStart,
            lt: nextMonthStart,
          },
          type: TransactionType.EXPENSE,
          source: "sumup",
          category: "SumUp Komisyonu",
        },
        orderBy: {
          date: "asc",
        },
      }),
    ]);

    const manualExpenseTotal = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

    const sumupFeeTotal = sumupFees.reduce(
      (sum, transaction) =>
        sum + Number(transaction.amount),
      0
    );

    const expenseTotal =
      manualExpenseTotal + sumupFeeTotal;

    const expenseCategories = expenses.reduce(
      (acc, expense) => {
        const category =
          expense.category || "Diğer";

        const amount = Number(expense.amount);

        acc[category] =
          (acc[category] ?? 0) + amount;

        return acc;
      },
      {} as Record<string, number>
    );

    if (sumupFeeTotal > 0) {
      expenseCategories["SumUp Komisyonu"] =
        (expenseCategories["SumUp Komisyonu"] ?? 0) +
        sumupFeeTotal;
    }

    const bankBalance = bankAccounts
      .filter(
        (account) =>
          account.type === AccountType.BANK
      )
      .reduce(
        (sum, account) =>
          sum + Number(account.balance),
        0
      );

    const cashBalance = bankAccounts
      .filter(
        (account) =>
          account.type === AccountType.CASH
      )
      .reduce(
        (sum, account) =>
          sum + Number(account.balance),
        0
      );

    const sumupBalance = bankAccounts
      .filter(
        (account) =>
          account.type === AccountType.SUMUP
      )
      .reduce(
        (sum, account) =>
          sum + Number(account.balance),
        0
      );

    const totalLiquidity =
      bankBalance + cashBalance + sumupBalance;

    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();

    const chart = Array.from(
      { length: daysInMonth },
      (_, index) => {
        const day = index + 1;

        const dateKey =
          `${now.getFullYear()}-` +
          `${String(now.getMonth() + 1).padStart(2, "0")}-` +
          `${String(day).padStart(2, "0")}`;

        const tillhubDay = tillhubDaily.find(
          (item) => item.date === dateKey
        );

        const manualDayExpenses = expenses
          .filter(
            (expense) =>
              expense.date.getDate() === day
          )
          .reduce(
            (sum, expense) =>
              sum + Number(expense.amount),
            0
          );

        const sumupDayFees = sumupFees
          .filter(
            (transaction) =>
              transaction.date.getDate() === day
          )
          .reduce(
            (sum, transaction) =>
              sum + Number(transaction.amount),
            0
          );

        return {
          day,
          label: `${day} ${now.toLocaleString(
            "tr-TR",
            {
              month: "short",
            }
          )}`,
          revenue: tillhubDay?.revenue ?? 0,
          expenses:
            manualDayExpenses + sumupDayFees,
        };
      }
    );

    return Response.json({
      success: true,

      period: {
        start: monthStart,
        end: nextMonthStart,
      },

      revenue: tillhubData.total,

      expenses: expenseTotal,

      expenseBreakdown: {
        manual: manualExpenseTotal,
        sumupFees: sumupFeeTotal,
      },

      netProfit:
        tillhubData.total - expenseTotal,

      sales: {
        cash: tillhubData.cashTotal,
        card: tillhubData.cardTotal,
        online: 0,
      },

      bankBalance,
      cashBalance,
      sumupBalance,
      totalLiquidity,

      chart,
      expenseCategories,

      tillhub: tillhubData,
    });
  } catch (error) {
    console.error("GET /api/dashboard:", error);

    return Response.json(
      {
        success: false,
        message:
          "Dashboard verileri alınamadı.",
      },
      { status: 500 }
    );
  }
}
