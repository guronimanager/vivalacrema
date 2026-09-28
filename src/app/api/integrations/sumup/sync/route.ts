import { prisma } from "@/lib/prisma";
import {
  AccountType,
  TransactionType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SumUpRow = {
  amount?: number;
  fee?: number;
  currency?: string;
  date?: string;
  id?: number;
  reference?: string;
  status?: string;
  type?: string;
};

type Payout = {
  reference: string;
  date: string;
  currency: string;
  grossAmount: number;
  fees: number;
  netAmount: number;
};

async function getPayouts(): Promise<Payout[]> {
  const token = process.env.SUMUP_API_TOKEN;

  if (!token) {
    throw new Error("SUMUP_API_TOKEN bulunamadı.");
  }

  const merchantCode = "MEEUSF6C";

  const now = new Date();

  const startDate =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const endDate =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).getDate()
    ).padStart(2, "0")}`;

  const url =
    `https://api.sumup.com/v1.0/merchants/${merchantCode}/payouts` +
    `?start_date=${startDate}` +
    `&end_date=${endDate}` +
    `&limit=9999` +
    `&order=desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `SumUp payout request failed: ${response.status}`
    );
  }

  const rows: SumUpRow[] = Array.isArray(data) ? data : [];

  const groups = new Map<string, Payout>();

  for (const row of rows) {
    if (
      row.status !== "SUCCESSFUL" ||
      row.type !== "PAYOUT" ||
      !row.reference
    ) {
      continue;
    }

    const current = groups.get(row.reference) ?? {
      reference: row.reference,
      date: row.date ?? "",
      currency: row.currency ?? "EUR",
      grossAmount: 0,
      fees: 0,
      netAmount: 0,
    };

    const amount = Number(row.amount ?? 0);
    const fee = Number(row.fee ?? 0);

    current.grossAmount += amount;
    current.fees += fee;
    current.netAmount += amount - fee;

    groups.set(row.reference, current);
  }

  return Array.from(groups.values()).map((item) => ({
    ...item,
    grossAmount: Number(item.grossAmount.toFixed(2)),
    fees: Number(item.fees.toFixed(2)),
    netAmount: Number(item.netAmount.toFixed(2)),
  }));
}

export async function POST() {
  try {
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

    let sumupAccount = await prisma.bankAccount.findFirst({
      where: {
        businessId: business.id,
        type: AccountType.SUMUP,
      },
    });

    if (!sumupAccount) {
      sumupAccount = await prisma.bankAccount.create({
        data: {
          businessId: business.id,
          name: "SumUp",
          type: AccountType.SUMUP,
          balance: 0,
        },
      });
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        businessId: business.id,
        type: AccountType.BANK,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!bankAccount) {
      return Response.json(
        {
          success: false,
          message:
            "SumUp payout aktarımı için BANK tipinde hesap bulunamadı.",
        },
        { status: 400 }
      );
    }

    const payouts = await getPayouts();

    let imported = 0;
    let skipped = 0;

    for (const payout of payouts) {
      const externalBase = payout.reference;

      const alreadyImported =
        await prisma.transaction.findFirst({
          where: {
            source: "sumup",
            externalId: `${externalBase}:bank`,
          },
        });

      if (alreadyImported) {
        skipped += 1;
        continue;
      }

      const date = new Date(`${payout.date}T12:00:00.000Z`);

      await prisma.$transaction(async (tx) => {
        // 1) SumUp clearing hesabına brüt settlement.
        await tx.transaction.create({
          data: {
            businessId: business.id,
            bankAccountId: sumupAccount.id,
            date,
            type: TransactionType.TRANSFER,
            category: "SumUp Settlement",
            description: `${payout.reference} brüt settlement`,
            amount: payout.grossAmount,
            source: "sumup",
            externalId: `${externalBase}:gross`,
          },
        });

        await tx.bankAccount.update({
          where: {
            id: sumupAccount.id,
          },
          data: {
            balance: {
              increment: payout.grossAmount,
            },
          },
        });

        // 2) SumUp komisyonu.
        if (payout.fees > 0) {
          await tx.transaction.create({
            data: {
              businessId: business.id,
              bankAccountId: sumupAccount.id,
              date,
              type: TransactionType.EXPENSE,
              category: "SumUp Komisyonu",
              description: `${payout.reference} komisyon`,
              amount: payout.fees,
              source: "sumup",
              externalId: `${externalBase}:fee`,
            },
          });

          await tx.bankAccount.update({
            where: {
              id: sumupAccount.id,
            },
            data: {
              balance: {
                decrement: payout.fees,
              },
            },
          });
        }

        // 3) SumUp clearing hesabından net payout çıkışı.
        await tx.transaction.create({
          data: {
            businessId: business.id,
            bankAccountId: sumupAccount.id,
            date,
            type: TransactionType.TRANSFER,
            category: "SumUp Payout",
            description: `${payout.reference} banka transferi çıkışı`,
            amount: -payout.netAmount,
            source: "sumup",
            externalId: `${externalBase}:out`,
          },
        });

        await tx.bankAccount.update({
          where: {
            id: sumupAccount.id,
          },
          data: {
            balance: {
              decrement: payout.netAmount,
            },
          },
        });

        // 4) Banka hesabına net payout girişi.
        await tx.transaction.create({
          data: {
            businessId: business.id,
            bankAccountId: bankAccount.id,
            date,
            type: TransactionType.TRANSFER,
            category: "SumUp Payout",
            description: `${payout.reference} banka transferi`,
            amount: payout.netAmount,
            source: "sumup",
            externalId: `${externalBase}:bank`,
          },
        });

        await tx.bankAccount.update({
          where: {
            id: bankAccount.id,
          },
          data: {
            balance: {
              increment: payout.netAmount,
            },
          },
        });
      });

      imported += 1;
    }

    return Response.json({
      success: true,
      payoutCount: payouts.length,
      imported,
      skipped,
      sumupAccount: {
        id: sumupAccount.id,
        name: sumupAccount.name,
      },
      bankAccount: {
        id: bankAccount.id,
        name: bankAccount.name,
      },
    });
  } catch (error) {
    console.error("POST /api/integrations/sumup/sync:", error);

    return Response.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "SumUp senkronizasyonu başarısız.",
      },
      { status: 500 }
    );
  }
}
