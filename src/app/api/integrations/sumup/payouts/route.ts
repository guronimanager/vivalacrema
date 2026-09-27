import { NextResponse } from "next/server";

type SumUpPayout = {
  amount?: number;
  fee?: number;
  currency?: string;
  date?: string;
  id?: number;
  reference?: string;
  status?: string;
  transaction_code?: string;
  type?: string;
};

export async function GET() {
  try {
    const token = process.env.SUMUP_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "SUMUP_API_TOKEN bulunamadı" },
        { status: 500 }
      );
    }

    const merchantCode = "MEEUSF6C";
    const startDate = "2026-09-01";
    const endDate = "2026-09-30";

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
      return NextResponse.json({
        success: false,
        status: response.status,
        data,
      });
    }

    const rows: SumUpPayout[] = Array.isArray(data) ? data : [];

    const groups = new Map<
      string,
      {
        reference: string;
        date: string;
        currency: string;
        status: string;
        grossAmount: number;
        fees: number;
        netAmount: number;
        transactionCount: number;
      }
    >();

    for (const row of rows) {
      const reference = row.reference || `unknown-${row.id}`;

      const current = groups.get(reference) ?? {
        reference,
        date: row.date || "",
        currency: row.currency || "EUR",
        status: row.status || "",
        grossAmount: 0,
        fees: 0,
        netAmount: 0,
        transactionCount: 0,
      };

      const amount = Number(row.amount || 0);
      const fee = Number(row.fee || 0);

      current.grossAmount += amount;
      current.fees += fee;
      current.netAmount += amount - fee;
      current.transactionCount += 1;

      groups.set(reference, current);
    }

    const payouts = Array.from(groups.values()).map((payout) => ({
      ...payout,
      grossAmount: Number(payout.grossAmount.toFixed(2)),
      fees: Number(payout.fees.toFixed(2)),
      netAmount: Number(payout.netAmount.toFixed(2)),
    }));

    const totals = payouts.reduce(
      (acc, payout) => {
        acc.grossAmount += payout.grossAmount;
        acc.fees += payout.fees;
        acc.netAmount += payout.netAmount;
        return acc;
      },
      {
        grossAmount: 0,
        fees: 0,
        netAmount: 0,
      }
    );

    totals.grossAmount = Number(totals.grossAmount.toFixed(2));
    totals.fees = Number(totals.fees.toFixed(2));
    totals.netAmount = Number(totals.netAmount.toFixed(2));

    return NextResponse.json({
      success: true,
      status: response.status,
      merchantCode,
      period: {
        startDate,
        endDate,
      },
      rawCount: rows.length,
      payoutCount: payouts.length,
      totals,
      payouts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}
