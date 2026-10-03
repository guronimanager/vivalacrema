import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const sessionCookie = "vlc_archive_session";
export const oauthCookie = "vlc_archive_oauth";
export class ArchiveError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function key() {
  const value = process.env.ONEDRIVE_ENCRYPTION_KEY;
  if (!value) throw new ArchiveError("OneDrive şifreleme ayarı eksik.", 503);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32) throw new ArchiveError("OneDrive şifreleme ayarı geçersiz.", 503);
  return decoded;
}
export function seal(value: unknown, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function unseal<T>(value: string, purpose: string): T {
  const raw = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
}
export function configured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.ONEDRIVE_ALLOWED_EMAIL && process.env.ONEDRIVE_ENCRYPTION_KEY && process.env.ONEDRIVE_REDIRECT_URI && process.env.BLOB_READ_WRITE_TOKEN && process.env.ONEDRIVE_ARCHIVE_FOLDER_URL);
}
export function allowedEmail() { return process.env.ONEDRIVE_ALLOWED_EMAIL?.trim().toLowerCase(); }
export function cookieOptions(origin: string, maxAge: number) {
  return { httpOnly: true, secure: new URL(origin).protocol === "https:", sameSite: "lax" as const, path: "/", maxAge };
}
export function assertOrigin(request: Request) {
  const expected = process.env.ONEDRIVE_REDIRECT_URI;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin) throw new ArchiveError("Bu isteğe izin verilmiyor.", 403);
}
export interface ArchiveSession { accountId: string; email: string; expiresAt: number }
export async function session(): Promise<ArchiveSession | null> {
  const raw = (await cookies()).get(sessionCookie)?.value;
  if (!raw) return null;
  try {
    const value = unseal<ArchiveSession>(raw, "session");
    return value.expiresAt > Date.now() && value.email === allowedEmail() && typeof value.accountId === "string" ? value : null;
  } catch { return null; }
}
export async function requireSession() {
  const value = await session();
  if (!value) throw new ArchiveError("Evraklara erişmek için kişisel Microsoft hesabınızla giriş yapın.", 401);
  return value;
}
export function failure(error: unknown) {
  return Response.json({ success: false, message: error instanceof ArchiveError ? error.message : "İşlem tamamlanamadı. Bağlantıyı kontrol edip yeniden deneyin." }, { status: error instanceof ArchiveError ? error.status : 502, headers: { "Cache-Control": "no-store" } });
}
