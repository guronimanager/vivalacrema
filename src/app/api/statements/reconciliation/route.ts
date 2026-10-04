import { prisma } from "@/lib/prisma";
import { requirePortal } from "@/lib/users/auth";
import {
  assertOrigin,
  requireSession,
  ArchiveError,
} from "@/lib/onedrive/security";
import { readInput, InputError } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
import { savePayment } from "@/lib/invoices/service";
import { previewStatement } from "@/lib/statements/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requirePortal("bank");
    await requirePortal("expenses");
    const current = await requireSession();
    const params = new URL(request.url).searchParams;
    const month = params.get("month") || "";
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      Number(month.slice(0, 4)) < 2000 ||
      Number(month.slice(0, 4)) > 2100
    )
      throw new InputError("Geçerli dönem seçin.");
    const page = Number(params.get("page") || 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000)
      throw new InputError("Geçerli sayfa seçin.");
    const status = params.get("status") || "ALL";
    if (!["ALL", "PENDING", "MATCHED"].includes(status))
      throw new InputError("Eşleştirme durumunu seçin.");
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const business = await prisma.business.findFirst();
    if (!business) throw new InputError("İşletme bulunamadı.");
    const transactions = await prisma.transaction.findMany({
      where: {
        businessId: business.id,
        type: "EXPENSE",
        bankAccount: { type: "BANK" },
        ...(params.get("account")
          ? { bankAccountId: params.get("account")! }
          : {}),
        date: { gte: start, lt: end },
        OR: [{ source: null }, { source: { not: "sumup" } }],
        ...(status === "PENDING"
          ? { invoicePayment: null }
          : status === "MATCHED"
            ? { invoicePayment: { isNot: null } }
            : {}),
      },
      include: {
        bankAccount: true,
        invoicePayment: {
          include: { invoice: { include: { supplier: true } } },
        },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 101,
      skip: page * 100,
    });
    const visible = transactions.slice(0, 100);
    const suggestions = new Map();
    for (const bankId of new Set(
      visible.filter((t) => !t.invoicePayment).map((t) => t.bankAccountId),
    )) {
      const group = visible.filter(
        (t) => t.bankAccountId === bankId && !t.invoicePayment,
      );
      const previews = await previewStatement(
        bankId!,
        group.map((t) => ({
          date: t.date.toISOString().slice(0, 10),
          amount: t.amount.negated().toFixed(2),
          description: t.description || "",
          reference: "",
        })),
        current.accountId,
      );
      group.forEach((t, i) => suggestions.set(t.id, previews[i].suggestions));
    }
    return Response.json(
      {
        success: true,
        hasMore: transactions.length > 100,
        records: visible.map((t) => ({
          id: t.id,
          date: t.date.toISOString().slice(0, 10),
          amount: t.amount.toDecimalPlaces(2).toNumber(),
          description: t.description,
          accountName: t.bankAccount?.name,
          source: t.source,
          matchedInvoice: t.invoicePayment
            ? `${t.invoicePayment.invoice.supplier.name} · ${t.invoicePayment.invoice.invoiceNumber}`
            : null,
          suggestions: suggestions.get(t.id) || [],
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
    await requirePortal("bank", true);
    await requirePortal("expenses", true);
    const current = await requireSession();
    const body = await readInput(request);
    if (
      typeof body.transactionId !== "string" ||
      typeof body.invoiceId !== "string"
    )
      throw new InputError("Banka hareketi ve fatura seçin.");
    const business = await prisma.business.findFirst();
    const bank =
      business &&
      (await prisma.transaction.findFirst({
        where: {
          id: body.transactionId,
          businessId: business.id,
          type: "EXPENSE",
          bankAccount: { type: "BANK" },
          OR: [{ source: null }, { source: { not: "sumup" } }],
        },
      }));
    if (!bank)
      throw new ArchiveError("Uygun banka çıkış hareketi bulunamadı.", 404);
    const payment = await savePayment(
      {
        invoiceId: body.invoiceId,
        transactionId: bank.id,
        paymentId: body.paymentId,
        requestId: body.requestId,
        method: "BANK",
        date: bank.date.toISOString().slice(0, 10),
        amount: bank.amount.toFixed(2),
        reference: bank.description || "Banka eşleştirmesi",
      },
      current.accountId,
    );
    return Response.json(
      { success: true, paymentId: payment.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invoiceFailure(error);
  }
}
