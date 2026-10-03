export interface StatementRow {
  date: string;
  amount: string;
  description: string;
  reference: string;
}
export interface Columns {
  date: number;
  amount: number;
  description: number;
  reference: number;
  direction: number;
  counterparty?: number;
}
export function csvTable(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error("CSV en fazla 2 MB olabilir.");
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.startsWith("sep=")
    ? first.slice(4).trim()
    : [";", ",", "\t"].sort(
        (a, b) => first.split(b).length - first.split(a).length,
      )[0];
  if (first.startsWith("sep="))
    text = text.slice(first.length).replace(/^\r?\n/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!cell || quoted) quoted = !quoted;
      else throw new Error("CSV tırnak biçimi geçersiz.");
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV içinde kapanmamış tırnak var.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 1001)
    throw new Error("Başlık ve en fazla 1.000 hareket içeren CSV yükleyin.");
  return rows;
}
export function statementDate(raw: string) {
  let date = raw.trim();
  const german = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
  if (german) date = `${german[3]}-${german[2]}-${german[1]}`;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(new Date(date).getTime()) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error(
      "Geçerli bir işlem tarihi girin (GG.AA.YYYY veya YYYY-AA-GG).",
    );
  return date;
}
export function signedMoney(raw: string) {
  let value = raw.trim().replace(/\s|€|EUR/gi, "");
  if (value.includes(",")) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value))
      throw new Error("EUR tutar biçimi geçersiz.");
    value = value.replace(/\./g, "").replace(",", ".");
  }
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("EUR tutarını en fazla iki ondalıkla girin.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || !amount || Math.abs(amount) >= 1e10)
    throw new Error("Hareket tutarı sıfır olamaz ve hesap sınırını aşamaz.");
  return amount.toFixed(2);
}
export function validateRows(value: unknown): StatementRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000)
    throw new Error("1–1.000 banka hareketi seçin.");
  return value.map((item, index) => {
    try {
      if (
        !item ||
        typeof item.date !== "string" ||
        typeof item.amount !== "string" ||
        typeof item.description !== "string" ||
        typeof item.reference !== "string" ||
        item.description.length > 500 ||
        item.reference.length > 200
      )
        throw new Error("Hareket alanlarını kontrol edin.");
      return {
        date: statementDate(item.date),
        amount: signedMoney(item.amount),
        description: item.description.trim(),
        reference: item.reference.trim(),
      };
    } catch (error) {
      throw new Error(`${index + 1}. hareket: ${(error as Error).message}`);
    }
  });
}
export function csvRows(table: string[][], columns: Columns) {
  if (
    ![columns.date, columns.amount].every(
      (n) => Number.isInteger(n) && n >= 0 && n < table[0].length,
    ) ||
    columns.date === columns.amount
  )
    throw new Error("Tarih ve tutar sütunlarını ayrı seçin.");
  for (const column of [
    columns.description,
    columns.reference,
    columns.direction,
    columns.counterparty ?? -1,
  ]) {
    if (!Number.isInteger(column) || column < -1 || column >= table[0].length)
      throw new Error("CSV sütun seçimi geçersiz.");
  }
  const currencyColumn = table[0].findIndex((header) =>
    /^(währung|waehrung|currency|para birimi)$/i.test(header.trim()),
  );
  const rows = table.slice(1).map((row, index) => {
    if (
      currencyColumn >= 0 &&
      !["EUR", "€"].includes(row[currencyColumn]?.trim().toUpperCase())
    )
      throw new Error(
        `${index + 2}. CSV satırında EUR dışı veya belirsiz para birimi var.`,
      );
    if (row.length !== table[0].length)
      throw new Error(
        `${index + 2}. CSV satırında sütun sayısı farklı. Başlık dışı satırları temizleyin.`,
      );
    let amount = signedMoney(row[columns.amount]);
    if (columns.direction >= 0) {
      const direction = row[columns.direction]
        ?.trim()
        .toLocaleLowerCase("de-DE");
      if (["s", "soll", "debit", "expense", "çıkış"].includes(direction))
        amount = (-Math.abs(Number(amount))).toFixed(2);
      else if (["h", "haben", "credit", "income", "giriş"].includes(direction))
        amount = Math.abs(Number(amount)).toFixed(2);
      else
        throw new Error(
          `${index + 2}. CSV satırında giriş/çıkış bilgisi geçersiz.`,
        );
    }
    const statusColumn = table[0].findIndex((header) =>
      /^(info|status|buchungsstatus)$/i.test(header.trim()),
    );
    if (statusColumn >= 0 && /vorgemerkt|pending/i.test(row[statusColumn]))
      throw new Error(
        `${index + 2}. CSV satırı henüz bankada kesinleşmemiş. Yalnızca gebuchte Umsätze dışa aktarın.`,
      );
    const counterparty = row[columns.counterparty ?? -1] || "";
    const description = [counterparty, row[columns.description] || ""]
      .filter(Boolean)
      .join(" · ");
    return {
      date: row[columns.date],
      amount,
      description,
      reference: row[columns.reference] || "",
    };
  });
  return validateRows(rows);
}
export function guessColumns(header: string[]): Columns {
  const find = (pattern: RegExp) =>
    header.findIndex((h) => pattern.test(h.toLocaleLowerCase("de-DE")));
  return {
    date: find(/buchungstag|buchungsdatum|booking date|^date$|tarih/),
    amount: find(/betrag|^amount$|tutar/),
    description: find(
      /verwendungszweck|beschreibung|description|aciklama|açıklama/,
    ),
    reference: find(/end.to.end|referenz|reference|referans/),
    counterparty: find(
      /begünstigter|beguenstigter|zahlungspflichtiger|empfänger|empfaenger|absender|counterparty/,
    ),
    direction: find(/^soll.haben$|^s.h$|direction|yön/),
  };
}

export function assertCsvAccount(
  table: string[][],
  expectedIban: string | null | undefined,
) {
  if (!expectedIban) return;
  const column = table[0].findIndex((header) =>
    /^(auftragskonto|kontoiban|konto.iban)$/i.test(header.replace(/\s/g, "")),
  );
  if (column < 0) return;
  const expected = expectedIban.replace(/\s/g, "").toUpperCase();
  for (const row of table.slice(1)) {
    const value = row[column]?.replace(/\s/g, "").toUpperCase();
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value) && value !== expected)
      throw new Error(
        "CSV’nin Auftragskonto IBAN’ı seçilen banka hesabıyla uyuşmuyor.",
      );
  }
}
