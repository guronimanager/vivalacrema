import { assertOrigin, requireSession } from "@/lib/onedrive/security";
import { readInput } from "@/lib/record-input";
import { invoiceFailure } from "@/lib/invoices/errors";
import {
  listProducts,
  saveProduct,
  updateProduct,
} from "@/lib/catalog/service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireSession();
    return Response.json(
      { success: true, products: await listProducts() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return invoiceFailure(e);
  }
}
async function save(request: Request, update: boolean) {
  try {
    assertOrigin(request);
    await requireSession();
    const body = await readInput(request);
    return Response.json({
      success: true,
      product: update ? await updateProduct(body) : await saveProduct(body),
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
