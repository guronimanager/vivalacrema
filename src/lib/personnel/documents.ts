import { prisma } from "@/lib/prisma";
import { validateMetadata, type DocumentMetadata, type ArchiveDocument } from "@/lib/document-format";
import { ArchiveError } from "@/lib/onedrive/security";

export async function employeeMetadata(input: unknown): Promise<DocumentMetadata> {
  let metadata: DocumentMetadata;
  try { metadata = validateMetadata(input); } catch { throw new ArchiveError("Belge bilgileri geçersiz."); }
  if (metadata.kind !== "EMPLOYEE") return metadata;
  if (!metadata.employeeId) throw new ArchiveError("Belgenin ait olduğu personeli seçin.");
  const business = await prisma.business.findFirst({ select: { id: true } });
  const employee = business && await prisma.employee.findFirst({ where: { id: metadata.employeeId, businessId: business.id }, select: { name: true } });
  if (!employee) throw new ArchiveError("Personel kaydı bulunamadı.", 404);
  return { ...metadata, entity: employee.name };
}
export function sameDocumentAssignment(document: ArchiveDocument, metadata: DocumentMetadata) {
  if ((document.employeeId || metadata.employeeId || document.kind === "EMPLOYEE" || metadata.kind === "EMPLOYEE") &&
      (document.kind !== metadata.kind || document.employeeId !== metadata.employeeId)) {
    throw new ArchiveError("Bu dosya arşivde farklı bir kayda bağlı. Personel evrakı başka kişiye otomatik atanamaz.", 409);
  }
  return document;
}
export function belongsToEmployee(document: ArchiveDocument, employeeId: string) {
  return document.kind === "EMPLOYEE" && document.employeeId === employeeId;
}
export function employeeDocument(document: ArchiveDocument) {
  return { id: document.id, originalName: document.originalName, date: document.date, size: document.size, syncStatus: document.syncStatus };
}
