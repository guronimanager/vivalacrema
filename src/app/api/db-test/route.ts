import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const businesses = await prisma.business.findMany();

    return Response.json({
      success: true,
      businesses,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        success: false,
        message: "Database connection failed",
      },
      { status: 500 }
    );
  }
}
