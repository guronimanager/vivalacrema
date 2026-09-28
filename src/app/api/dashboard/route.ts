import { prisma } from "@/lib/prisma";
import {
  AccountType,
  TransactionType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

function round2(value: number) {
  return Number(value.toFixed(2));
}

async function getTillhubToken() {
  const apiKey = process.env.TILLHUB_API_TOKEN;
  const accountId = process.env.TILLHUB_ACCOUNT_ID;

  if (!apiKey || !accountId) {
    throw new Error("TillHub environment variables eksik.");
  }

  const response = await fetch(
    "https://api.tillhub.com/api/v1/users/auth/key",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: accountId,
        api_key: apiKey,
      }),
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.token) {
    throw new Error("TillHub authentication failed.");
  }

  return {
    token: data.token as string,
    accountId,
  };
}

async function getTillhubDashboardData(
  startDate: string,
  endDate: string
) {
  const { token, accountId } = await getTillhubToken();

  const start = `${startDate}T00:00:00.000Z`;
  const end = `${endDate}T00:00:00.000Z`;

  const paymentsUrl =
    `https://api.tillhub.com/api/v0/analytics/${accountId}/reports/payments/top` +
    `?branch_number=1` +
    `&start=${encodeURIComponent(start)}` +
    `&end=${encodeURIComponent(end)}`;

  const transactionsUrl =
    `https://api.tillhub.com/api/v0/analytics/${accountId}/reports/transactions/simple` +
    `?start=${encodeURIComponent(start)}` +
    `&end=${encodeURIComponent(end)}`;

  const [paymentsResponse, transactionsResponse] =
    await Promise.all([
      fetch(paymentsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),

      fetch(transactionsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
    ]);

  if (!paymentsResponse.ok) {
    throw new Error(
      `TillHub payments failed: ${paymentsResponse.status}`
    );
  }

  if (!transactionsResponse.ok) {
    throw new Error(
      `TillHub transactions failed: ${transactionsResponse.status}`
    );
  }

  const paymentsData = await paymentsResponse.json();
  const transactionsData = await transactionsResponse.json();

  const paymentReport = paymentsData?.results?.[0];
  const paymentValues = Array.isArray(paymentReport?.values)
    ? paymentReport.values
    : [];

  const cash = paymentValues.find(
    (item: any) =>
      item?.name === "Bar" ||
      item?.payment_type === "cash"
  );

  const card = paymentValues.find(
    (item: any) =>
      item?.name === "Kartenzahlung" ||
      item?.payment_type === "card"
  );

  const cashTotal = Number(cash?.sum ?? 0);
  const cardTotal = Number(card?.sum ?? 0);

  const cashCount = Number(cash?.payment_count ?? 0);
  const cardCount = Number(card?.payment_count ?? 0);

  const transactionReport =
    transactionsData?.results?.[0];

  const rows = Array.isArray(transactionReport?.results)
    ? transactionReport.results
    : [];

  const dailyMap = new Map<string, number>();

  for (const row of rows) {
    if (!row?.date) continue;

    const date = new Date(row.date);
    const key = date.toISOString().slice(0, 10);

    const amount = Number(
      row?.selling_price_total ?? 0
    );

    dailyMap.set(
      key,
      (dailyMap.get(key) ?? 0) + amount
    );
  }

  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({
      date,
      revenue: round2(revenue),
    }));

  return {
    cashTotal: round2(cashTotal),
    cardTotal: round2(cardTotal),
    total: round2(cashTotal + cardTotal),
    cashCount,
    cardCount,
    paymentCount: cashCount + cardCount,
    daily,
  };
}

export async function GET() {
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

    const startDate = monthStart
      .toISOString()
      .slice(0, 10);

    const endDate = nextMonthStart
      .toISOString()
      .slice(0, 10);

    const [
      tillhubData,
      expenses,
      bankAccounts,
      sumupFees,
    ] = await Promise.all([
      getTillhubDashboardData(startDate, endDate),

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
      (sum, expense) =>
        sum + Number(expense.amount),
      0
    );

    const sumupFeeTotal = sumupFees.reduce(
      (sum, transaction) =>
        sum + Number(transaction.amount),
      0
    );

    const expenseTotal = round2(
      manualExpenseTotal + sumupFeeTotal
    );

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
        round2(
          (expenseCategories["SumUp Komisyonu"] ?? 0) +
            sumupFeeTotal
        );
    }

    const bankBalance = round2(
      bankAccounts
        .filter(
          (account) =>
            account.type === AccountType.BANK
        )
        .reduce(
          (sum, account) =>
            sum + Number(account.balance),
          0
        )
    );

    const cashBalance = round2(
      bankAccounts
        .filter(
          (account) =>
            account.type === AccountType.CASH
        )
        .reduce(
          (sum, account) =>
            sum + Number(account.balance),
          0
        )
    );

    const sumupBalance = round2(
      bankAccounts
        .filter(
          (account) =>
            account.type === AccountType.SUMUP
        )
        .reduce(
          (sum, account) =>
            sum + Number(account.balance),
          0
        )
    );

    const totalLiquidity = round2(
      bankBalance +
        cashBalance +
        sumupBalance
    );

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

        const tillhubDay =
          tillhubData.daily.find(
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
            { month: "short" }
          )}`,
          revenue:
            tillhubDay?.revenue ?? 0,
          expenses: round2(
            manualDayExpenses + sumupDayFees
          ),
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
        manual: round2(manualExpenseTotal),
        sumupFees: round2(sumupFeeTotal),
      },

      netProfit: round2(
        tillhubData.total - expenseTotal
      ),

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

      tillhub: {
        cashTotal: tillhubData.cashTotal,
        cardTotal: tillhubData.cardTotal,
        total: tillhubData.total,
        cashCount: tillhubData.cashCount,
        cardCount: tillhubData.cardCount,
        paymentCount:
          tillhubData.paymentCount,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/dashboard:",
      error
    );

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
