import { prisma } from "@/lib/prisma";
import { AccountType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await prisma.bankAccount.findMany({
      orderBy: {
        createdAt: "asc",
      },
    });

    return Response.json({
      success: true,
      accounts: accounts.map((account) => ({
        ...account,
        balance: Number(account.balance),
      })),
    });
  } catch (error) {
    console.error("GET /api/bank-accounts:", error);

    return Response.json(
      {
        success: false,
        message: "Banka hesapları alınamadı.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

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

    const name = String(body?.name ?? "").trim();
    const bankName = String(body?.bankName ?? "").trim();
    const iban = String(body?.iban ?? "").trim();

    const balance = Number(body?.balance ?? 0);

    const type = String(
      body?.type ?? "BANK"
    ).trim() as AccountType;

    if (!name) {
      return Response.json(
        {
          success: false,
          message: "Hesap adı zorunludur.",
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(balance)) {
      return Response.json(
        {
          success: false,
          message: "Geçerli bir başlangıç bakiyesi girin.",
        },
        { status: 400 }
      );
    }

    if (
      type !== AccountType.BANK &&
      type !== AccountType.CASH &&
      type !== AccountType.SUMUP
    ) {
      return Response.json(
        {
          success: false,
          message: "Geçerli bir hesap tipi seçin.",
        },
        { status: 400 }
      );
    }

    const account = await prisma.bankAccount.create({
      data: {
        businessId: business.id,
        name,
        bankName: bankName || null,
        iban: iban || null,
        balance,
        type,
      },
    });

    return Response.json(
      {
        success: true,
        account: {
          ...account,
          balance: Number(account.balance),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/bank-accounts:", error);

    return Response.json(
      {
        success: false,
        message: "Banka hesabı kaydedilemedi.",
      },
      { status: 500 }
    );
  }
}
