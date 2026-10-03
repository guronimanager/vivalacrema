import { ArchiveError } from "./security";

/** Resolve the user-selected folder, and refuse a different owner's shared drive. */
export async function resolveArchiveFolder(token: string) {
  const sharingUrl = process.env.ONEDRIVE_ARCHIVE_FOLDER_URL;
  if (!sharingUrl) throw new ArchiveError("OneDrive arşiv klasörü ayarı eksik.", 503);
  const url = new URL(sharingUrl);
  if (url.protocol !== "https:" || !["1drv.ms", "onedrive.live.com"].includes(url.hostname) || url.username || url.password) throw new ArchiveError("OneDrive arşiv klasörü bağlantısı geçersiz.", 503);
  const shareId = `u!${Buffer.from(sharingUrl).toString("base64url")}`;
  const options = { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" as const };
  const [driveResponse, folderResponse] = await Promise.all([
    fetch("https://graph.microsoft.com/v1.0/me/drive?$select=id", { ...options, signal: AbortSignal.timeout(25000) }),
    fetch(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,folder,parentReference`, { ...options, signal: AbortSignal.timeout(25000) }),
  ]);
  if (!driveResponse.ok || !folderResponse.ok) throw new ArchiveError("Seçilen OneDrive klasörüne erişilemiyor. Kişisel hesabınızı ve klasör bağlantısını kontrol edin.", 502);
  const drive = await driveResponse.json() as { id?: string };
  const folder = await folderResponse.json() as { id?: string; name?: string; folder?: object; parentReference?: { driveId?: string } };
  if (!folder.id || !folder.folder || !drive.id || folder.parentReference?.driveId?.toLowerCase() !== drive.id.toLowerCase()) throw new ArchiveError("Arşiv hedefi bağlı kişisel OneDrive hesabınıza ait bir klasör olmalıdır.", 403);
  return { id: folder.id, name: folder.name };
}
