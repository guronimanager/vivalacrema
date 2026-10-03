import { prisma } from "@/lib/prisma";
import { accessToken, mailScopes } from "@/lib/onedrive/connection";
import { ArchiveError } from "@/lib/onedrive/security";
import { getRequest, requestMessage } from "./service";
import { requestPdf } from "./pdf";
export async function sendRequestEmail(
  id: string,
  accountId: string,
  email: string,
  expectedRecipient: string,
) {
  const record = await getRequest(id, accountId);
  if (record.creatorEmail.toLowerCase() !== email.toLowerCase())
    throw new ArchiveError(
      "Talebi yalnızca oluşturan kullanıcı kendi hesabından gönderebilir.",
      403,
    );
  if (record.supplier.email !== expectedRecipient)
    throw new ArchiveError(
      "Tedarikçinin alıcı adresi değişti. Talebi yenileyip tekrar onaylayın.",
      409,
    );
  if (!record.supplier.email)
    throw new ArchiveError("Tedarikçinin e-posta adresini kaydedin.");
  if (!["NOT_SENT", "FAILED"].includes(record.emailStatus))
    throw new ArchiveError(
      "Bu talep zaten gönderime alındı. Belirsiz durumlarda Gönderilmiş Öğeler’i kontrol edin; otomatik tekrar gönderilmez.",
      409,
    );
  let token: string;
  try {
    token = await accessToken(accountId, mailScopes);
  } catch {
    throw new ArchiveError(
      "Kendi Microsoft posta hesabınızı e-posta gönderme izniyle bağlayın.",
      401,
    );
  }
  const pdf = await requestPdf(record);
  const claim = await prisma.purchaseRequest.updateMany({
    where: { id, accountId, emailStatus: { in: ["NOT_SENT", "FAILED"] } },
    data: { emailStatus: "SENDING", emailRecipient: record.supplier.email },
  });
  if (claim.count !== 1)
    throw new ArchiveError("Başka bir gönderim devam ediyor.", 409);
  let state = "UNKNOWN";
  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: `Viva La Crema · Angebotsanfrage ${record.number}`,
            body: { contentType: "Text", content: requestMessage(record) },
            toRecipients: [
              { emailAddress: { address: record.supplier.email } },
            ],
            attachments: [
              {
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: `${record.number}.pdf`,
                contentType: "application/pdf",
                contentBytes: pdf.toString("base64"),
              },
            ],
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (response.status === 202) state = "ACCEPTED";
    else if (response.status >= 400 && response.status < 500) state = "FAILED";
  } catch {
    /* A lost response may have been accepted: never retry automatically. */
  }
  await prisma.purchaseRequest.update({
    where: { id },
    data: {
      emailStatus: state,
      ...(state === "ACCEPTED" ? { emailSentAt: new Date() } : {}),
    },
  });
  if (state !== "ACCEPTED")
    throw new ArchiveError(
      state === "FAILED"
        ? "Microsoft e-posta isteğini reddetti. Posta iznini ve alıcıyı kontrol edin."
        : "Gönderim sonucu doğrulanamadı. Gönderilmiş Öğeler’i kontrol edin; tekrar gönderim engellendi.",
      502,
    );
  return {
    status: state,
    message:
      "Microsoft gönderimi kabul etti. Bu, alıcıya teslim edildiği anlamına gelmez.",
  };
}
