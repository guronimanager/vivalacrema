import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePortal } from "@/lib/users/auth";
import { requireSession, failure, ArchiveError } from "@/lib/onedrive/security";
import { listDocuments, publicDocument } from "@/lib/onedrive/documents";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export async function GET(request: Request) {
  try {
    await requirePortal("archive");
    await requirePortal("bank");
    await requirePortal("expenses");
    const current = await requireSession();
    const year = new URL(request.url).searchParams.get("year") || "";
    if (!/^(19|20|21)\d{2}$/.test(year))
      throw new ArchiveError("Geçerli rapor yılı seçin.");
    const period = {
      gte: new Date(`${year}-01-01T00:00:00Z`),
      lt: new Date(`${Number(year) + 1}-01-01T00:00:00Z`),
    };
    const data = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const business = await tx.business.findFirst({ select: { id: true } });
        if (!business) throw new ArchiveError("İşletme bulunamadı.", 404);
        const transactions = await tx.transaction.findMany({
          where: { businessId: business.id, date: period },
          include: {
            bankAccount: { select: { name: true, type: true } },
            invoicePayment: { select: { invoiceId: true } },
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          take: 10001,
        });
        const invoices = await tx.purchaseInvoice.findMany({
          where: {
            businessId: business.id,
            accountId: current.accountId,
            date: period,
          },
          include: { supplier: { select: { name: true } }, payments: true },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          take: 10001,
        });
        const expenses = await tx.expense.findMany({
          where: { businessId: business.id, date: period },
          include: { invoice: { select: { id: true, documentId: true } } },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          take: 10001,
        });
        if (
          Math.max(transactions.length, invoices.length, expenses.length) >
          10000
        )
          throw new ArchiveError(
            "Yıllık rapor sınırı aşıldı; aylık inceleme gerekiyor.",
            413,
          );
        return {
          transactions: transactions.map((t) => ({
            id: t.id,
            date: t.date.toISOString().slice(0, 10),
            type: t.type,
            amount: t.amount.toFixed(2),
            description: t.description,
            source: t.source,
            externalId: t.externalId,
            accountName: t.bankAccount?.name,
            accountType: t.bankAccount?.type,
            invoiceId: t.invoicePayment?.invoiceId || null,
          })),
          invoices: invoices.map((i) => ({
            id: i.id,
            documentId: i.documentId,
            date: i.date.toISOString().slice(0, 10),
            supplierName: i.supplier.name,
            invoiceNumber: i.invoiceNumber,
            totalAmount: i.totalAmount.toFixed(2),
            dueDate: i.dueDate?.toISOString().slice(0, 10),
            payments: i.payments.map((p) => ({
              id: p.id,
              date: p.date.toISOString().slice(0, 10),
              amount: p.amount.toFixed(2),
              method: p.method,
              transactionId: p.transactionId,
              reference: p.reference,
            })),
          })),
          expenses: expenses.map((e) => ({
            id: e.id,
            date: e.date.toISOString().slice(0, 10),
            amount: e.amount.toFixed(2),
            category: e.category,
            description: e.description,
            invoiceId: e.invoice?.id || null,
            documentId: e.invoice?.documentId || null,
          })),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
    const documents = (await listDocuments(current.accountId))
      .filter((d) =>
        (d.archivePeriod || d.date.slice(0, 7)).startsWith(`${year}-`),
      )
      .map(publicDocument);
    return Response.json(
      {
        success: true,
        year,
        capturedAt: new Date().toISOString(),
        complete: true,
        ...data,
        documents,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
