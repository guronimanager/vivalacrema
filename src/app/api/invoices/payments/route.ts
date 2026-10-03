import { prisma } from "@/lib/prisma";
import { readInput } from "@/lib/record-input";
import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { savePayment } from "@/lib/invoices/service";
import { invoiceFailure } from "@/lib/invoices/errors";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireSession();
    const business = await prisma.business.findFirst();
    const transactions = business
      ? await prisma.transaction.findMany({
          where: {
            businessId: business.id,
            type: "EXPENSE",
            bankAccount: { type: "BANK" },
            OR: [{ source: null }, { source: { not: "sumup" } }],
            invoicePayment: null,
          },
          orderBy: { date: "desc" },
          take: 200,
        })
      : [];
    return Response.json(
      {
        success: true,
        transactions: transactions.map((t) => ({
          id: t.id,
          date: t.date.toISOString().slice(0, 10),
          amount: t.amount.toNumber(),
          description: t.description,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const current = await requireSession();
    const payment = await savePayment(
      await readInput(request),
      current.accountId,
    );
    return Response.json(
      { success: true, paymentId: payment.id },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
