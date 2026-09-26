import { prisma } from "@/lib/prisma";

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
let tillhubDaily: { date: string; revenue: number }[] = [];

try {
  const baseUrl = new URL(request.url).origin;
  
  const tillhubResponse = await fetch(
    `${baseUrl}/api/integrations/tillhub/payments-top?start=${startDate}&end=${endDate}`,
    {
      cache: "no-store",
    }
  );

  if (tillhubResponse.ok) {
    const result = await tillhubResponse.json();

    tillhubData = {
      cashTotal: Number(result?.cashTotal ?? 0),
      cardTotal: Number(result?.cardTotal ?? 0),
      total: Number(result?.total ?? 0),
      cashCount: Number(result?.cashCount ?? 0),
      cardCount: Number(result?.cardCount ?? 0),
      paymentCount: Number(result?.paymentCount ?? 0),
    };
const transactionsResponse = await fetch(
  `${baseUrl}/api/integrations/tillhub/transactions?start=${startDate}&end=${endDate}`,
  {
    cache: "no-store",
  }
);

if (transactionsResponse.ok) {
  const transactionsResult = await transactionsResponse.json();

  tillhubDaily = Array.isArray(transactionsResult?.daily)
    ? transactionsResult.daily
    : [];
}
  }
} catch (error) {
  console.error("TillHub dashboard fetch error:", error);
}

    const [sales, expenses, bankAccounts] = await Promise.all([
      prisma.sale.findMany({
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
    ]);

    const revenue = sales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );

    const expenseTotal = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

    const bankBalance = bankAccounts.reduce(
      (sum, account) => sum + Number(account.balance),
      0
    );

    const cash = sales.reduce(
      (sum, sale) => sum + Number(sale.cash),
      0
    );

    const card = sales.reduce(
      (sum, sale) => sum + Number(sale.card),
      0
    );

    const online = sales.reduce(
      (sum, sale) => sum + Number(sale.online),
      0
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

    const tillhubDay = tillhubDaily.find(
      (item) => item.date === dateKey
    );
    
    const dayExpenses = expenses
          .filter((expense) => expense.date.getDate() === day)
          .reduce(
            (sum, expense) => sum + Number(expense.amount),
            0
          );

        return {
          day,
          label: `${day} ${now.toLocaleString("tr-TR", {
            month: "short",
          })}`,
          revenue: tillhubDay?.revenue ?? 0,
          expenses: dayExpenses,
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
netProfit: tillhubData.total - expenseTotal,

sales: {
  cash: tillhubData.cashTotal,
  card: tillhubData.cardTotal,
  online: 0,
},

      bankBalance,
      chart,
      tillhub: tillhubData,
    });
  } catch (error) {
    console.error("GET /api/dashboard:", error);

    return Response.json(
      {
        success: false,
        message: "Dashboard verileri alınamadı.",
      },
      { status: 500 }
    );
  }
}
