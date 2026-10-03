export const documentKinds = {
  INVOICE_SERVICE: "Hizmet / servis faturası",
  INVOICE_MATERIAL: "Malzeme faturası",
  BANK_STATEMENT: "Banka ekstresi",
  EMPLOYEE: "Personel evrakı",
  ACCOUNTING: "Muhasebe evrakı",
  TAX: "Vergi evrakı",
} as const;
export const archiveFolders = ["01_Bankkontoauszug", "02_Online_Rechnungen", "03_Online_Portal", "04_Quittungen", "05_Lohnabrechnungen", "06_Briefe", "07_Berichte_und_Zusammenfassungen", "08_Abgestimmt"] as const;
export type ArchiveFolder = typeof archiveFolders[number];
export const defaultArchiveFolders: Record<keyof typeof documentKinds, ArchiveFolder> = {
  INVOICE_SERVICE: "02_Online_Rechnungen", INVOICE_MATERIAL: "02_Online_Rechnungen", BANK_STATEMENT: "01_Bankkontoauszug", EMPLOYEE: "06_Briefe", ACCOUNTING: "07_Berichte_und_Zusammenfassungen", TAX: "06_Briefe",
};
export type DocumentKind = keyof typeof documentKinds;
export interface DocumentMetadata { kind: DocumentKind; entity: string; date: string; originalName: string; archiveFolder?: ArchiveFolder; employeeId?: string; archivePeriod?: string; notifyEmployee?: boolean; emailRecipient?: string }
export interface ArchiveDocument extends DocumentMetadata {
  id: string; pathname: string; contentType: string; size: number; createdAt: string;
  accountId: string; oneDrivePath: string; syncStatus: "PENDING" | "SYNCED" | "FAILED";
  emailStatus?: "NOT_SENT" | "SENDING" | "ACCEPTED" | "FAILED" | "UNKNOWN"; emailSentAt?: string; emailMessage?: string;
  oneDriveItemId?: string; syncedAt?: string; syncMessage?: string;
}
export const maximumFileSize = 20 * 1024 * 1024;
export const contentTypes = ["application/pdf", "image/jpeg", "image/png", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
export function safeSegment(value: string) {
  const cleaned = value.normalize("NFC").replace(/[\x00-\x1f\x7f"*:<>?\/\\|#%]/g, "-").replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).replace(/[. ]+$/g, "");
  return cleaned || "Belirtilmemiş";
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateMetadata(value: unknown): DocumentMetadata {
  if (!value || typeof value !== "object") throw new Error("Belge bilgileri eksik.");
  const input = value as Record<string, unknown>;
  if (typeof input.kind !== "string" || !Object.hasOwn(documentKinds, input.kind) || typeof input.entity !== "string" || !input.entity.trim() || input.entity.length > 120 || typeof input.date !== "string" || !validDate(input.date) || typeof input.originalName !== "string" || !input.originalName.trim() || input.originalName.length > 255) throw new Error("Belge türü, ilgili kişi/kurum, tarih ve dosya adı geçerli olmalıdır.");
  if (input.archiveFolder !== undefined && !archiveFolders.includes(input.archiveFolder as ArchiveFolder)) throw new Error("Arşiv alt klasörü geçersiz.");
  if (input.archivePeriod !== undefined && (typeof input.archivePeriod !== "string" || !/^\d{4}-\d{2}$/.test(input.archivePeriod) || !validDate(`${input.archivePeriod}-01`))) throw new Error("Arşiv yılı ve ayı geçersiz.");
  if (input.employeeId !== undefined && (input.kind !== "EMPLOYEE" || typeof input.employeeId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.employeeId))) throw new Error("Personel bağlantısı geçersiz.");
  if (input.notifyEmployee !== undefined && (input.kind !== "EMPLOYEE" || typeof input.notifyEmployee !== "boolean")) throw new Error("Personel e-posta seçimi geçersiz.");
  return { ...(input.notifyEmployee !== undefined ? { notifyEmployee: input.notifyEmployee as boolean } : {}), ...(input.archivePeriod ? { archivePeriod: input.archivePeriod as string } : {}), ...(input.employeeId ? { employeeId: input.employeeId as string } : {}), ...(input.archiveFolder ? { archiveFolder: input.archiveFolder as ArchiveFolder } : {}), kind: input.kind as DocumentKind, entity: input.entity.trim(), date: input.date, originalName: input.originalName };
}
export function oneDrivePath(metadata: DocumentMetadata, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Belge kimliği geçersiz.");
  validateMetadata(metadata);
  const period = metadata.archivePeriod || metadata.date.slice(0, 7);
  const year = period.slice(0, 4);
  const month = period.slice(5, 7);
  const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const folder = metadata.archiveFolder || defaultArchiveFolders[metadata.kind];
  const name = safeSegment(metadata.originalName);
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  return [`VLC UG ${year}`, `${year}.${month}_${months[Number(month) - 1]}`, folder, `${metadata.date}_${safeSegment(metadata.entity)}_${base}_${hash}${extension}`].join("/");
}
