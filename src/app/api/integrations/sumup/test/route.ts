import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.SUMUP_API_TOKEN;

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        message: "SUMUP_API_TOKEN tanımlı değil.",
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://api.sumup.com/v0.1/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          status: response.status,
          message: "SumUp API bağlantısı başarısız.",
          error: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      status: response.status,
      merchant: {
        merchantCode: data.merchant_code ?? null,
        businessName:
          data.merchant_profile?.doing_business_as ??
          data.merchant_profile?.company_name ??
          null,
        currency: data.merchant_profile?.default_currency ?? null,
        country: data.merchant_profile?.country ?? null,
      },
    });
  } catch (error) {
    console.error("SumUp test error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "SumUp API isteği sırasında hata oluştu.",
      },
      { status: 500 }
    );
  }
}
