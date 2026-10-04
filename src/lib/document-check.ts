export async function checkExistingDocument(
  file: File,
  period: string,
  folder: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const id = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const response = await fetch("/api/documents/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, size: file.size, period, folder }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "Mükerrer belge kontrolü tamamlanamadı.");
  return result;
}
