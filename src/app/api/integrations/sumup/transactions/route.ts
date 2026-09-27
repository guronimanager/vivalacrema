import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.SUMUP_API_TOKEN;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "SUMUP_API_TOKEN tanımlı değil." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      "https://api.sumup.com/v0.1/me/transactions/history?limit=20&order=descending",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          status: response.status,
          error: data,
        },
        { status: response.status }
      );
    }

    const items = Array.isArray(data?.items) ? data.items : [];

    const transactions = items.map((item: any) => ({
      id: item.id,
      transactionId: item.transaction_id,
      transactionCode: item.transaction_code,
      timestamp: item.timestamp,
      amount: Number(item.amount ?? 0),
      currency: item.currency,
      status: item.status,
      type: item.type,
      paymentType: item.payment_type,
      cardType: item.card_type,
      refundedAmount: Number(item.refunded_amount ?? 0),
      payoutsReceived: Number(item.payouts_received ?? 0),
      payoutsTotal: Number(item.payouts_total ?? 0),
    }));

    const successful = transactions.filter(
      (item: any) => item.status === "SUCCESSFUL"
    );

    const total = successful.reduce(
      (sum: number, item: any) => sum + item.amount,
      0
    );

    return NextResponse.json({
      success: true,
      status: response.status,
      count: transactions.length,
      successfulCount: successful.length,
      successfulTotal: Math.round(total * 100) / 100,
      transactions,
    });
  } catch (error) {
    console.error("SumUp transactions error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "SumUp işlemleri alınırken hata oluştu.",
      },
      { status: 500 }
    );
  }
}
