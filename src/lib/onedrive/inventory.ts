import { createHash, randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import {
  archiveFolders,
  contentTypes,
  maximumFileSize,
  oneDrivePath,
  validateMetadata,
  type ArchiveFolder,
  type ArchiveDocument,
} from "@/lib/document-format";
import { accessToken } from "./connection";
import { resolveArchiveFolder } from "./folder";
import { readDocument, writeDocument } from "./documents";
import { ArchiveError, seal, unseal } from "./security";
export interface RemoteFile {
  id: string;
  name: string;
  size: number;
  eTag: string;
  file?: { mimeType?: string };
  folder?: object;
}
export function inventorySelection(
  period: unknown,
  folder: unknown,
  subpath = "",
) {
  if (
    typeof period !== "string" ||
    !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(period) ||
    !archiveFolders.includes(folder as ArchiveFolder)
  )
    throw new ArchiveError("Arşiv yılı, ayı ve klasörünü seçin.");
  if (
    typeof subpath !== "string" ||
    subpath.length > 600 ||
    (subpath &&
      subpath
        .split("/")
        .some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            /[\\\x00-\x1f]/.test(part),
        ))
  )
    throw new ArchiveError("Alt klasör yolu geçersiz.");
  const metadata = validateMetadata({
    kind: "ACCOUNTING",
    entity: "OneDrive arşivi",
    date: `${period}-01`,
    originalName: "belge.pdf",
    archivePeriod: period,
    archiveFolder: folder,
  });
  return {
    period,
    folder: folder as ArchiveFolder,
    subpath,
    path:
      oneDrivePath(metadata, "0".repeat(64)).split("/").slice(0, -1).join("/") +
      (subpath ? `/${subpath}` : ""),
  };
}
async function graph(token: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new ArchiveError(
      response.status === 404
        ? "Seçilen OneDrive klasörü veya dosyası bulunamadı."
        : "OneDrive okunamadı. Bağlantınızı kontrol edip yeniden deneyin.",
      response.status === 404 ? 404 : 502,
    );
  return response;
}
async function context(
  accountId: string,
  period: unknown,
  folder: unknown,
  subpath = "",
) {
  const selection = inventorySelection(period, folder, subpath);
  const token = await accessToken(accountId);
  const root = await resolveArchiveFolder(token);
  const base = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(root.id)}:/${selection.path.split("/").map(encodeURIComponent).join("/")}`;
  const remote = (await (await graph(token, base)).json()) as {
    id: string;
    folder?: object;
  };
  if (!remote.id || !remote.folder)
    throw new ArchiveError("Seçilen yol bir arşiv klasörü değil.");
  return { ...selection, token, parentId: remote.id };
}
export async function scanArchive(
  accountId: string,
  period: unknown,
  folder: unknown,
  cursor?: string,
  subpath = "",
) {
  const selected = await context(accountId, period, folder, subpath);
  let url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(selected.parentId)}/children?$top=20&$select=id,name,size,eTag,file,folder`;
  if (cursor) {
    let saved: {
      accountId: string;
      parentId: string;
      url: string;
      expires: number;
    };
    try {
      saved = unseal(cursor, "archive-inventory");
    } catch {
      throw new ArchiveError("Tarama oturumu geçersiz; yeniden başlatın.");
    }
    if (
      saved.accountId !== accountId ||
      saved.parentId !== selected.parentId ||
      saved.expires < Date.now() ||
      !saved.url.startsWith(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(selected.parentId)}/children?`,
      )
    )
      throw new ArchiveError("Tarama oturumu sona erdi; yeniden başlatın.");
    url = saved.url;
  }
  const page = (await (await graph(selected.token, url)).json()) as {
    value: RemoteFile[];
    "@odata.nextLink"?: string;
  };
  return {
    folders: page.value
      .filter((item) => item.folder)
      .map((item) => ({
        id: item.id,
        name: item.name,
        subpath: [selected.subpath, item.name].filter(Boolean).join("/"),
      })),
    files: page.value
      .filter((item) => !item.folder && item.file)
      .map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        supported:
          item.size > 0 &&
          item.size <= maximumFileSize &&
          contentTypes.includes(item.file?.mimeType || mimeType(item.name)),
        path: `${selected.path}/${item.name}`,
      })),
    cursor: page["@odata.nextLink"]
      ? seal(
          {
            accountId,
            parentId: selected.parentId,
            url: page["@odata.nextLink"],
            expires: Date.now() + 3600000,
          },
          "archive-inventory",
        )
      : null,
  };
}
function mimeType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return (
    (
      {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        csv: "text/csv",
        docx: contentTypes[4],
        xlsx: contentTypes[5],
      } as Record<string, string>
    )[extension || ""] || "application/octet-stream"
  );
}
async function remoteContent(
  selected: Awaited<ReturnType<typeof context>>,
  itemId: string,
) {
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`;
  const remote = (await (
    await graph(
      selected.token,
      `${url}?$select=id,name,size,eTag,file,parentReference`,
    )
  ).json()) as RemoteFile & { parentReference?: { id?: string } };
  if (
    !remote.file ||
    remote.folder ||
    remote.parentReference?.id !== selected.parentId
  )
    throw new ArchiveError("Dosya seçilen arşiv klasörüne ait değil.", 403);
  const contentType = contentTypes.includes(remote.file.mimeType || "")
    ? remote.file.mimeType!
    : mimeType(remote.name);
  if (
    !contentTypes.includes(contentType) ||
    remote.size < 1 ||
    remote.size > maximumFileSize
  )
    throw new ArchiveError("Desteklenmeyen dosya türü veya 20 MB sınırı.");
  const response = await graph(selected.token, `${url}/content`);
  if (!response.body)
    throw new ArchiveError("OneDrive dosyası okunamadı.", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumFileSize) {
      await reader.cancel();
      throw new ArchiveError("Dosya 20 MB sınırını aşıyor.");
    }
    chunks.push(value);
  }
  const current = (await (
    await graph(selected.token, `${url}?$select=eTag,parentReference`)
  ).json()) as { eTag: string; parentReference?: { id?: string } };
  if (
    size !== remote.size ||
    current.eTag !== remote.eTag ||
    current.parentReference?.id !== selected.parentId
  )
    throw new ArchiveError(
      "Dosya tarama sırasında değişti; yeniden tarayın.",
      409,
    );
  const content = Buffer.concat(chunks);
  const id = createHash("sha256").update(content).digest("hex");
  return { remote, contentType, size, content, id };
}
export async function registerRemoteDocument(
  accountId: string,
  period: unknown,
  folder: unknown,
  itemId: string,
  subpath = "",
) {
  if (!/^[a-zA-Z0-9!_-]{1,200}$/.test(itemId))
    throw new ArchiveError("Dosya kimliği geçersiz.");
  const selected = await context(accountId, period, folder, subpath);
  const { remote, contentType, size, content, id } = await remoteContent(
    selected,
    itemId,
  );
  try {
    return {
      document: (await readDocument(id, accountId)).document,
      duplicate: true,
    };
  } catch (error) {
    if (!(error instanceof ArchiveError) || error.status !== 404) throw error;
  }
  const name =
    remote.name
      .normalize("NFC")
      .replace(/[^\p{L}\p{N} ._()\-]/gu, "-")
      .replace(/\.\./g, "-")
      .slice(-100) || "evrak";
  const blob = await put(`documents/files/${randomUUID()}/${name}`, content, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
  });
  const kind =
    selected.folder === "01_Bankkontoauszug"
      ? "BANK_STATEMENT"
      : selected.folder === "05_Lohnabrechnungen"
        ? "EMPLOYEE"
        : [
              "02_Online_Rechnungen",
              "04_Quittungen",
              "08_Abgestimmt",
            ].includes(selected.folder)
          ? "INVOICE_MATERIAL"
          : "ACCOUNTING";
  const document: ArchiveDocument = {
    id,
    pathname: blob.pathname,
    contentType,
    size,
    accountId,
    kind,
    entity:
      kind === "INVOICE_MATERIAL"
        ? "Fatura kontrolü bekliyor"
        : "OneDrive arşivi",
    date: `${selected.period}-01`,
    archivePeriod: selected.period,
    archiveFolder: selected.folder,
    originalName: remote.name,
    createdAt: new Date().toISOString(),
    oneDrivePath: `${selected.path}/${remote.name}`,
    oneDriveItemId: remote.id,
    syncStatus: "SYNCED",
    syncedAt: new Date().toISOString(),
    source: "ONEDRIVE",
    dateNeedsReview: true,
  };
  try {
    await writeDocument(document);
  } catch (error) {
    try {
      return {
        document: (await readDocument(id, accountId)).document,
        duplicate: true,
      };
    } catch {
      throw error;
    }
  }
  return { document, duplicate: false };
}

/** Check same-sized remote originals before starting a new client upload. */
export async function findRemoteDuplicate(
  accountId: string,
  period: unknown,
  folder: unknown,
  hash: string,
  size: number,
) {
  if (
    !/^[a-f0-9]{64}$/.test(hash) ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > maximumFileSize
  )
    throw new ArchiveError("Dosya içeriği veya boyutu geçersiz.");
  const queue: { subpath: string; cursor?: string }[] = [{ subpath: "" }];
  let checked = 0;
  for (let page = 0; queue.length && page < 10; page++) {
    const branch = queue.shift()!;
    const selected = await context(accountId, period, folder, branch.subpath);
    const listed = await scanArchive(
      accountId,
      period,
      folder,
      branch.cursor,
      branch.subpath,
    );
    queue.push(...listed.folders.map((child) => ({ subpath: child.subpath })));
    for (const file of listed.files.filter(
      (file) => file.supported && file.size === size,
    )) {
      if (++checked > 10)
        throw new ArchiveError(
          "Aynı boyutta çok sayıda evrak var. Önce Evrak Arşivi’nden belgeleri tanıtın; tekrar yükleme başlamadı.",
          409,
        );
      const content = await remoteContent(selected, file.id);
      if (content.id === hash)
        return (
          await registerRemoteDocument(
            accountId,
            period,
            folder,
            file.id,
            branch.subpath,
          )
        ).document;
    }
    if (listed.cursor)
      queue.unshift({ subpath: branch.subpath, cursor: listed.cursor });
  }
  if (!queue.length) return null;
  throw new ArchiveError(
    "Klasör ön kontrol sınırını aşıyor. Önce Evrak Arşivi’nden taramayı tamamlayın; tekrar yükleme başlamadı.",
    409,
  );
}
