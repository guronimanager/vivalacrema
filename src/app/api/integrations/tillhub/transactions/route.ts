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

export async function GET() {
  try {
    const { token, accountId } = await getTillhubToken();

    const response = await fetch(
      `https://api.tillhub.com/api/v1/transactions/${accountId}?limit=100&start_date=2026-09-01&end_date=2026-09-25`,
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
      return Response.json(
        {
          success: false,
          status: response.status,
          message:
            data?.msg ??
            data?.message ??
            "TillHub transactions request failed",
        },
        { status: response.status }
      );
    }

    return Response.json({
      success: true,
      status: response.status,
      count: data?.count ?? null,
      hasResults: Array.isArray(data?.results),
      sample: data?.results?.slice(0, 3) ?? [],
    });
  } catch (error) {
    console.error("TillHub transactions error:", error);

    return Response.json(
      {
        success: false,
        message: "TillHub transaction verisi alınamadı.",
      },
      { status: 500 }
    );
  }
}
