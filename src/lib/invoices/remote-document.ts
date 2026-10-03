import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { ArchiveError } from "@/lib/onedrive/security";
export function publicAddress(address: string) {
  if (isIP(address) === 6)
    return /^[23]/.test(address) && !/^2001:db8:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function downloadDocument(
  source: string,
  redirects = 0,
): Promise<{ content: Buffer; contentType: string }> {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new ArchiveError("Geçerli bir HTTPS belge bağlantısı girin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    redirects > 3
  )
    throw new ArchiveError(
      "Yalnızca herkese açık HTTPS belge bağlantıları desteklenir.",
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new ArchiveError("Bu belge adresine erişime izin verilmiyor.", 403);
  const chosen = addresses[0];
  const response = await new Promise<import("node:http").IncomingMessage>(
    (resolve, reject) => {
      // Pin the validated IP to prevent DNS rebinding between validation and download.
      const req = request(
        url,
        {
          method: "GET",
          signal: AbortSignal.timeout(20000),
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [chosen]);
            else callback(null, chosen.address, chosen.family);
          },
          headers: { Accept: "application/pdf,image/jpeg,image/png" },
        },
        resolve,
      );
      req.setTimeout(20000, () => req.destroy(new Error("Download timeout")));
      req.on("error", reject);
      req.end();
    },
  );
  if (
    response.statusCode &&
    [301, 302, 303, 307, 308].includes(response.statusCode) &&
    response.headers.location
  ) {
    const next = new URL(response.headers.location, url).toString();
    response.destroy();
    return downloadDocument(next, redirects + 1);
  }
  const contentType = response.headers["content-type"]?.split(";")[0];
  if (
    response.statusCode !== 200 ||
    !contentType ||
    !["application/pdf", "image/jpeg", "image/png"].includes(contentType)
  ) {
    response.destroy();
    throw new ArchiveError(
      "Bağlantı doğrudan PDF, JPEG veya PNG dosyasını açmalı. Giriş gerektiren paylaşım sayfaları için dosyayı indirip yükleyin.",
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) {
      response.destroy();
      throw new ArchiveError("Bağlantıdaki belge 10 MB sınırını aşıyor.");
    }
    chunks.push(Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks);
  const valid =
    contentType === "application/pdf"
      ? content.subarray(0, 1024).includes(Buffer.from("%PDF-"))
      : contentType === "image/png"
        ? content
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : content[0] === 255 && content[1] === 216 && content[2] === 255;
  if (!valid)
    throw new ArchiveError("Bağlantıdaki dosyanın türü doğrulanamadı.");
  return { content, contentType };
}
