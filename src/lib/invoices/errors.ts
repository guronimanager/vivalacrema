import { Prisma } from "@prisma/client";
import { InputError } from "@/lib/record-input";
import { ArchiveError } from "@/lib/onedrive/security";
export function invoiceFailure(error: unknown) {
  let status = 502;
  let message = "İşlem tamamlanamadı. Yeniden deneyin.";
  if (error instanceof InputError) {
    status = 400;
    message = error.message;
  } else if (error instanceof ArchiveError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2021", "P2022"].includes(error.code)) {
      status = 503;
      message = "İlgili modülün veritabanı güncellemesi henüz uygulanmadı.";
    } else if (error.code === "P2002") {
      status = 409;
      message = "Bu kayıt veya kod zaten kullanılıyor. Mevcut kayıtları kontrol edin.";
    } else if (error.code === "P2034") {
      status = 409;
      message = "Kayıt başka bir işlemle güncellendi. Yeniden deneyin.";
    }
  }
  return Response.json(
    { success: false, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
