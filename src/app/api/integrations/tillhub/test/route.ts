export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey = process.env.TILLHUB_API_TOKEN;
    const accountId = process.env.TILLHUB_ACCOUNT_ID;

    if (!apiKey || !accountId) {
      return Response.json(
        {
          success: false,
          step: "environment",
          hasApiKey: Boolean(apiKey),
          hasAccountId: Boolean(accountId),
          message: "TillHub environment variables eksik.",
        },
        { status: 500 }
      );
    }

    // 1. API key ile TillHub JWT al
    const authResponse = await fetch(
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

    const authText = await authResponse.text();

    let authData: any = null;

    try {
      authData = JSON.parse(authText);
    } catch {
      authData = null;
    }

    if (!authResponse.ok || !authData?.token) {
      return Response.json(
        {
          success: false,
          step: "auth",
          status: authResponse.status,
          message:
            authData?.msg ??
            authData?.message ??
            "TillHub authentication failed",
        },
        { status: authResponse.status || 500 }
      );
    }

    // 2. JWT ile ürün çağrısını test et
    const productsResponse = await fetch(
      `https://api.tillhub.com/api/v1/products/${accountId}?limit=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authData.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const productsText = await productsResponse.text();

    let productsData: any = null;

    try {
      productsData = JSON.parse(productsText);
    } catch {
      productsData = null;
    }

    if (!productsResponse.ok) {
      return Response.json(
        {
          success: false,
          step: "products",
          status: productsResponse.status,
          message:
            productsData?.msg ??
            productsData?.message ??
            "TillHub products request failed",
        },
        { status: productsResponse.status }
      );
    }

    return Response.json({
      success: true,
      step: "complete",
      authStatus: authResponse.status,
      productsStatus: productsResponse.status,
      count: productsData?.count ?? null,
      hasResults: Array.isArray(productsData?.results),
      firstProductName:
        productsData?.results?.[0]?.name ??
        productsData?.results?.[0]?.title ??
        null,
    });
  } catch (error) {
    console.error("TillHub test:", error);

    return Response.json(
      {
        success: false,
        step: "exception",
        message: "TillHub bağlantısı sırasında beklenmeyen hata oluştu.",
      },
      { status: 500 }
    );
  }
}
