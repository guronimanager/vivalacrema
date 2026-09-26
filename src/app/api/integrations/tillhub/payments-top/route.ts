export const dynamic = "force-dynamic";

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
    token: data.token,
    accountId,
  };
}

export async function GET(request: Request) {
  try {
    const { token, accountId } = await getTillhubToken();
    const { searchParams } = new URL(request.url);

    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    const start = startParam
      ? `${startParam}T00:00:00.000Z`
      : "2026-09-01T00:00:00.000Z";

    const end = endParam
      ? `${endParam}T00:00:00.000Z`
      : "2026-09-27T00:00:00.000Z";
   

    const url =
      `https://api.tillhub.com/api/v0/analytics/${accountId}/reports/payments/top` +
      `?branch_number=1` +
      `&start=${encodeURIComponent(start)}` +
      `&end=${encodeURIComponent(end)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          status: response.status,
          message:
            data?.msg ??
            data?.message ??
            "TillHub top payments request failed",
        },
        { status: response.status }
      );
    }

   const report = data?.results?.[0];
const values = Array.isArray(report?.values) ? report.values : [];

const cash = values.find(
  (item: any) =>
    item?.name === "Bar" ||
    item?.payment_type === "cash"
);

const card = values.find(
  (item: any) =>
    item?.name === "Kartenzahlung" ||
    item?.payment_type === "card"
);

const cashTotal = Number(cash?.sum ?? 0);
const cardTotal = Number(card?.sum ?? 0);

const cashCount = Number(cash?.payment_count ?? 0);
const cardCount = Number(card?.payment_count ?? 0);

return Response.json({
  success: true,
  status: response.status,
  cashTotal,
  cardTotal,
  total: Number((cashTotal + cardTotal).toFixed(2)),
  cashCount,
  cardCount,
  paymentCount: cashCount + cardCount,
});
  } catch (error) {
    console.error("TillHub top payments error:", error);

    return Response.json(
      {
        success: false,
        message: "TillHub top payments verisi alınamadı.",
      },
      { status: 500 }
    );
  }
}
