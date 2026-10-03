import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { readDocument, writeDocument } from "@/lib/onedrive/documents";
import { accessToken, mailScopes } from "@/lib/onedrive/connection";
import { ArchiveError, seal, unseal } from "@/lib/onedrive/security";
import type { ArchiveDocument } from "@/lib/document-format";

async function approvedRecipient(employeeId: string) {
  const business = await prisma.business.findFirst({ select: { id: true } });
  const profile = business && await prisma.portalUser.findFirst({ where: { businessId: business.id, employeeId, role: "STAFF", accessState: "ACTIVE", employee: { active: true, businessId: business.id } }, select: { email: true } });
  if (!profile) throw new ArchiveError("Personelin e-posta gönderim onayı etkin değil.", 403);
  return profile.email;
}
interface MailTicket { id: string; accountId: string; employeeId: string; email: string; expiresAt: number }
export async function documentFromMailTicket(raw: string) {
  let ticket: MailTicket;
  try { ticket = unseal<MailTicket>(raw, "employee-document-mail"); } catch { throw new ArchiveError("Evrak bağlantısı geçersiz veya süresi dolmuş.", 403); }
  if (!ticket || !Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= Date.now() || !ticket.employeeId || !ticket.accountId || !ticket.email) throw new ArchiveError("Evrak bağlantısının süresi dolmuş.", 403);
  const { document } = await readDocument(ticket.id, ticket.accountId);
  if (document.kind !== "EMPLOYEE" || document.employeeId !== ticket.employeeId || await approvedRecipient(ticket.employeeId) !== ticket.email) throw new ArchiveError("Bu evraka erişim artık etkin değil.", 403);
  return document;
}
export async function sendEmployeeDocument(id: string, accountId: string, expectedRecipient?: string): Promise<ArchiveDocument> {
  const { document, etag } = await readDocument(id, accountId);
  if (document.kind !== "EMPLOYEE" || !document.employeeId) throw new ArchiveError("Belge bir personele bağlı olmalıdır.");
  if (["ACCEPTED", "UNKNOWN", "SENDING"].includes(document.emailStatus || "")) return document;
  const email = await approvedRecipient(document.employeeId);
  if (email !== (expectedRecipient || document.emailRecipient)) throw new ArchiveError("Personel e-postası değişti. Arşivi yenileyip yeni alıcıyı kontrol edin.", 409);
  let token: string;
  try { token = await accessToken(accountId, mailScopes); }
  catch {
    const failed: ArchiveDocument = { ...document, emailStatus: "FAILED", emailMessage: "Microsoft hesabınızı e-posta gönderme izniyle bağlayın." };
    await writeDocument(failed, etag); return failed;
  }
  const ticket = seal({ id, accountId, employeeId: document.employeeId, email, expiresAt: Date.now() + 7 * 86400000 }, "employee-document-mail");
  const url = new URL("/api/personnel/mail-download", process.env.ONEDRIVE_REDIRECT_URI!);
  url.searchParams.set("ticket", ticket);
  const message: { subject: string; body: { contentType: string; content: string }; toRecipients: { emailAddress: { address: string } }[]; attachments?: object[] } = {
    subject: `Viva La Crema · Personel evrakı · ${document.date}`,
    body: { contentType: "Text", content: `Merhaba ${document.entity},\n\n${document.originalName} adlı evrakınız Viva La Crema evrak arşivine kaydedildi.\nBelge tarihi: ${document.date}\n\nEvrakı indirin (7 gün geçerlidir; bu bağlantıyı paylaşmayın):\n${url.toString()}\n\nDaha sonra Evraklarım bölümünden de erişebilirsiniz.\nViva La Crema` },
    toRecipients: [{ emailAddress: { address: email } }],
  };
  // Graph's direct attachment limit is 3 MB; larger originals use the scoped link.
  if (document.size <= 2500000) {
    const file = await get(document.pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200) throw new ArchiveError("E-posta eki okunamadı.", 404);
    const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
    message.attachments = [{ "@odata.type": "#microsoft.graph.fileAttachment", name: document.originalName, contentType: document.contentType, contentBytes: bytes.toString("base64") }];
  }
  await writeDocument({ ...document, emailRecipient: email, emailStatus: "SENDING", emailMessage: undefined }, etag);
  let state: "ACCEPTED" | "FAILED" | "UNKNOWN" = "UNKNOWN";
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message, saveToSentItems: true }), signal: AbortSignal.timeout(30000) });
    if (response.status === 202) state = "ACCEPTED";
    else if (response.status >= 400 && response.status < 500) state = "FAILED";
  } catch { /* A lost acknowledgement may already have sent the mail; do not retry. */ }
  const latest = await readDocument(id, accountId);
  const saved: ArchiveDocument = { ...latest.document, emailRecipient: email, emailStatus: state,
    ...(state === "ACCEPTED" ? { emailSentAt: new Date().toISOString() } : {}),
    emailMessage: state === "ACCEPTED" ? "Microsoft gönderimi kabul etti; inbox teslimi ayrıca doğrulanmadı." : state === "FAILED" ? "Microsoft gönderimi reddetti. Posta iznini ve alıcıyı kontrol edin." : "Sonuç belirsiz. Gönderilmiş Öğeler’i kontrol edin; otomatik tekrar gönderilmez." };
  await writeDocument(saved, latest.etag);
  return saved;
}
