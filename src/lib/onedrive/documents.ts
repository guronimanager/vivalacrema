import { createHash } from "node:crypto";
import { BlobPreconditionFailedError, get, head, list, put } from "@vercel/blob";
import { type ArchiveDocument, type DocumentMetadata, contentTypes, maximumFileSize, oneDrivePath, validateMetadata } from "@/lib/document-format";
import { accessToken } from "./connection";
import { resolveArchiveFolder } from "./folder";
import { ArchiveError } from "./security";
const metadataPrefix = "documents/metadata/";
const idPattern = /^[a-f0-9]{64}$/;
export function validatePathname(pathname: string) {
  if (!/^documents\/files\/[a-f0-9-]{36}\/[\p{L}\p{N} ._()\-]+$/u.test(pathname) || pathname.includes("..") || pathname.length > 200) throw new ArchiveError("Dosya yolu geçersiz.");
}
export async function readDocument(id: string, accountId: string) {
  if (!idPattern.test(id)) throw new ArchiveError("Belge kimliği geçersiz.");
  const blob = await get(`${metadataPrefix}${id}.json`, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) throw new ArchiveError("Belge bulunamadı.", 404);
  const document = await new Response(blob.stream).json() as ArchiveDocument;
  if (document.accountId !== accountId) throw new ArchiveError("Bu belgeye erişim izni yok.", 403);
  return { document, etag: blob.blob.etag };
}
async function writeDocument(document: ArchiveDocument, etag?: string) {
  await put(`${metadataPrefix}${document.id}.json`, JSON.stringify(document), { access: "private", addRandomSuffix: false, allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), contentType: "application/json", cacheControlMaxAge: 0 });
}
export async function finalizeDocument(pathname: string, metadata: DocumentMetadata, accountId: string) {
  validatePathname(pathname);
  try { validateMetadata(metadata); } catch { throw new ArchiveError("Belge bilgileri geçersiz."); }
  const file = await head(pathname);
  if (file.size < 1 || file.size > maximumFileSize || !contentTypes.includes(file.contentType)) throw new ArchiveError("Dosya türü desteklenmiyor veya boyutu 20 MB sınırını aşıyor.");
  const blob = await get(pathname, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) throw new ArchiveError("Yüklenen dosya bulunamadı.", 404);
  const hash = createHash("sha256");
  const reader = blob.stream.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumFileSize) { await reader.cancel(); throw new ArchiveError("Dosya 20 MB sınırını aşıyor."); }
    hash.update(value);
  }
  const id = hash.digest("hex");
  try { return (await readDocument(id, accountId)).document; }
  catch (error) { if (!(error instanceof ArchiveError) || error.status !== 404) throw error; }
  const document: ArchiveDocument = { ...metadata, id, pathname, accountId, contentType: file.contentType, size: file.size, createdAt: new Date().toISOString(), oneDrivePath: oneDrivePath(metadata, id), syncStatus: "PENDING" };
  try { await writeDocument(document); }
  catch (error) {
    // Concurrent completion callbacks must converge on the same content hash.
    try { return (await readDocument(id, accountId)).document; } catch { throw error; }
  }
  return document;
}
export async function listDocuments(accountId: string) {
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await list({ prefix: metadataPrefix, limit: 1000, cursor });
    paths.push(...result.blobs.map(blob => blob.pathname));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  const documents: ArchiveDocument[] = [];
  for (let offset = 0; offset < paths.length; offset += 10) {
    const batch = await Promise.all(paths.slice(offset, offset + 10).map(async pathname => {
      const id = pathname.slice(metadataPrefix.length, -5);
      try { return (await readDocument(id, accountId)).document; }
      catch (error) { if (error instanceof ArchiveError && error.status === 403) return null; throw error; }
    }));
    documents.push(...batch.filter((value): value is ArchiveDocument => value !== null));
  }
  return documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function graph(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(25000) });
  return response;
}
function remoteFailure(status: number): never {
  throw new ArchiveError(status === 401 || status === 403 ? "OneDrive bağlantısını yeniden kurun." : status === 507 ? "OneDrive depolama alanı dolu." : status === 429 ? "OneDrive istek sınırına ulaşıldı; daha sonra yeniden deneyin." : "OneDrive aktarımı tamamlanamadı; yeniden deneyin.", 502);
}
export async function syncDocument(id: string, accountId: string) {
  const { document, etag } = await readDocument(id, accountId);
  if (document.syncStatus === "SYNCED") return document;
  try {
    const token = await accessToken(accountId);
    const parts = document.oneDrivePath.split("/");
    const filename = parts.pop()!;
    const root = await resolveArchiveFolder(token);
    let parentId: string = root.id;
    const segments: string[] = [];
    for (const name of parts) {
      segments.push(name);
      const location = `/me/drive/items/${encodeURIComponent(root.id)}:/${segments.map(encodeURIComponent).join("/")}`;
      const result = await graph(token, location);
      if (result.status === 404) throw new ArchiveError("Belge tarihine ait yıl, ay veya belge klasörü OneDrive’da bulunamadı. Mevcut klasör düzenini kontrol edin.", 409);
      if (!result.ok) remoteFailure(result.status);
      const folder = await result.json() as { id: string; folder?: object };
      if (!folder.folder || !folder.id) throw new ArchiveError("Arşiv klasör yolunda aynı isimli bir dosya var.", 409);
      parentId = folder.id;
    }
    const file = await get(document.pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200 || file.blob.size > maximumFileSize) throw new ArchiveError("Arşiv dosyası okunamadı.", 404);
    const content = await new Response(file.stream).arrayBuffer();
    const uploaded = await graph(token, `/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(filename)}:/content`, { method: "PUT", headers: { "Content-Type": document.contentType }, body: content });
    if (!uploaded.ok) remoteFailure(uploaded.status);
    const remote = await uploaded.json() as { id: string };
    if (!remote.id) throw new ArchiveError("OneDrive dosya kaydı doğrulanamadı.", 502);
    const saved: ArchiveDocument = { ...document, syncStatus: "SYNCED", oneDriveItemId: remote.id, syncedAt: new Date().toISOString(), syncMessage: undefined };
    try { await writeDocument(saved, etag); }
    catch (error) { if (error instanceof BlobPreconditionFailedError) return (await readDocument(id, accountId)).document; throw error; }
    return saved;
  } catch (error) {
    const failed: ArchiveDocument = { ...document, syncStatus: "FAILED", syncMessage: error instanceof ArchiveError ? error.message : "OneDrive aktarımı tamamlanamadı; yeniden deneyin." };
    try { await writeDocument(failed, etag); }
    catch (writeError) { if (writeError instanceof BlobPreconditionFailedError) return (await readDocument(id, accountId)).document; throw writeError; }
    return failed;
  }
}
export async function updatePendingDocument(id: string, metadata: DocumentMetadata, accountId: string) {
  const { document, etag } = await readDocument(id, accountId);
  // Previously synced originals stay where the user archived them.
  if (document.syncStatus === "SYNCED") return document;
  const valid = validateMetadata(metadata);
  const updated = { ...document, ...valid, oneDrivePath: oneDrivePath(valid, id), syncStatus: "PENDING" as const, syncMessage: undefined };
  await writeDocument(updated, etag);
  return updated;
}
export function publicDocument(document: ArchiveDocument) {
  const { accountId: _accountId, pathname: _pathname, ...visible } = document;
  void _accountId; void _pathname;
  return visible;
}
