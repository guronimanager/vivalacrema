import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/onedrive/security";
import { invoiceFailure } from "@/lib/invoices/errors";
import { queryPeriod } from "@/lib/period";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const current = await requireSession();
    let period;
    try {
      period = queryPeriod(new URL(request.url).searchParams);
    } catch (e) {
      return Response.json(
        { success: false, message: (e as Error).message },
        { status: 400 },
      );
    }
    const business = await prisma.business.findFirst();
    const records = business
      ? await prisma.supplier.findMany({
          where: { businessId: business.id },
          include: {
            invoices: {
              where: {
                accountId: current.accountId,
                date: { lt: new Date(`${period.endExclusive}T00:00:00Z`) },
              },
              include: {
                payments: {
                  where: {
                    date: { lt: new Date(`${period.endExclusive}T00:00:00Z`) },
                  },
                },
              },
            },
            documents: {
              where: { accountId: current.accountId },
              select: { documentId: true },
            },
            products: { select: { productId: true } },
          },
          orderBy: { name: "asc" },
        })
      : [];
    return Response.json(
      {
        success: true,
        period,
        records: records.map((s) => {
          let purchaseTotal = 0,
            outstanding = 0,
            periodOutstanding = 0;
          for (const invoice of s.invoices) {
            const remaining = invoice.payments.reduce(
              (v, p) => v.minus(p.amount),
              invoice.totalAmount,
            );
            outstanding += Math.max(0, remaining.toNumber());
            if (invoice.date.toISOString().slice(0, 10) >= period.start) {
              purchaseTotal += invoice.totalAmount.toNumber();
              periodOutstanding += Math.max(0, remaining.toNumber());
            }
          }
          return {
            id: s.id,
            name: s.name,
            email: s.email,
            phone: s.phone,
            taxNumber: s.taxNumber,
            purchaseTotal: Number(purchaseTotal.toFixed(2)),
            outstanding: Number(outstanding.toFixed(2)),
            periodOutstanding: Number(periodOutstanding.toFixed(2)),
            documents: s.documents,
            productCount: s.products.length,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return invoiceFailure(e);
  }
}
