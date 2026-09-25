import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

        const daySales = sales
          .filter((sale) => sale.date.getDate() === day)
          .reduce(
            (sum, sale) => sum + Number(sale.total),
            0
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
          revenue: daySales,
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

      revenue,
      expenses: expenseTotal,
      netProfit: revenue - expenseTotal,

      sales: {
        cash,
        card,
        online,
      },

      bankBalance,

      chart,
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
