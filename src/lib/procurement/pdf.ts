import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
interface PrintableRequest {
  number: string;
  creatorEmail: string;
  date: Date;
  requiredDate: Date | null;
  notes: string | null;
  supplier: { name: string; email: string | null };
  lines: {
    code: string;
    name: string;
    unit: string;
    quantity: { toString(): string };
    supplierCode: string | null;
  }[];
}
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (font.widthOfTextAtSize(line + char, size) > width) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    lines.push(line);
  }
  return lines;
}
export async function requestPdf(request: PrintableRequest) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(request.number);
  pdf.setAuthor("Viva La Crema");
  const font = await pdf.embedFont(
    await readFile(path.join(process.cwd(), "public/fonts/NotoSans.ttf")),
    { subset: true },
  );
  let page!: PDFPage,
    y = 0;
  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 0,
      y: 771.89,
      width: 595.28,
      height: 70,
      color: rgb(0.08, 0.09, 0.12),
    });
    page.drawText("Viva La Crema", {
      x: 40,
      y: 809,
      size: 20,
      font,
      color: rgb(1, 1, 1),
    });
    page.drawText(`Angebotsanfrage · ${request.number}`, {
      x: 40,
      y: 786,
      size: 10,
      font,
      color: rgb(0.85, 0.85, 0.85),
    });
    y = 744;
  };
  addPage();
  const text = (value: string, size = 10) => {
    for (const line of wrap(value, font, size, 515)) {
      if (y < 65) addPage();
      page.drawText(line, { x: 40, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 5;
    }
    y -= 5;
  };
  text(`Lieferant: ${request.supplier.name}`, 12);
  if (request.supplier.email) text(`E-Mail: ${request.supplier.email}`);
  text(
    `Datum: ${request.date.toISOString().slice(0, 10)} · Erstellt von: ${request.creatorEmail}`,
  );
  if (request.requiredDate)
    text(
      `Gewünschter Liefertermin: ${request.requiredDate.toISOString().slice(0, 10)}`,
    );
  text("Bitte teilen Sie uns Preis, Verfügbarkeit und Lieferbedingungen mit.");
  for (const [index, line] of request.lines.entries()) {
    const nameLines = wrap(line.name, font, 10, 515);
    if (y - (nameLines.length * 15 + 55) < 65) addPage();
    text(
      `${index + 1}. ${line.code} · ${line.quantity.toString()} ${({ ADET: "Stück", KG: "kg", LITRE: "l", KOLI: "Karton" } as Record<string, string>)[line.unit]}`,
      11,
    );
    text(line.name);
    if (line.supplierCode) text(`Ihre Artikelnummer: ${line.supplierCode}`, 9);
    page.drawLine({
      start: { x: 40, y: y + 3 },
      end: { x: 555, y: y + 3 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 10;
  }
  if (request.notes) {
    text("Anmerkungen", 11);
    text(request.notes);
  }
  text("Dies ist eine Angebotsanfrage, keine verbindliche Bestellung.", 9);
  for (const [index, p] of pdf.getPages().entries())
    p.drawText(`${request.number} · ${index + 1}/${pdf.getPageCount()}`, {
      x: 40,
      y: 30,
      size: 8,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  return Buffer.from(await pdf.save());
}
