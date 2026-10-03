"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  buttonClass,
  Field,
  inputClass,
  Notice,
  panelClass,
} from "@/components/finance/ui";
import {
  assertCsvAccount,
  csvRows,
  csvTable,
  guessColumns,
  type Columns,
  type StatementRow,
} from "@/lib/statements/input";
import { today, money as formatMoney } from "@/lib/finance";
interface Account {
  id: string;
  name: string;
  type: string;
  iban: string | null;
}
interface Preview extends StatementRow {
  duplicateId: string | null;
  settled: boolean;
  candidates: {
    id: string;
    description: string | null;
    source: string | null;
    settled: boolean;
  }[];
  suggestions: {
    id: string;
    label: string;
    remaining: number;
    paymentId: string | null;
    strong: boolean;
  }[];
}
async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(data.message || "İşlem tamamlanamadı.");
  return data;
}
export function StatementWorkspace({
  accounts,
  onSaved,
}: {
  accounts: Account[];
  onSaved: () => Promise<void>;
}) {
  const banks = accounts.filter((a) => a.type === "BANK");
  const [selectedAccount, setSelectedAccount] = useState("");
  const bankAccountId = selectedAccount || banks[0]?.id || "";
  const [frequency, setFrequency] = useState("MONTH");
  const [start, setStart] = useState(() => `${today().slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [documentId, setDocumentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<string[][]>([]);
  const [columns, setColumns] = useState<Columns>({
    date: -1,
    amount: -1,
    description: -1,
    reference: -1,
    direction: -1,
    counterparty: -1,
  });
  const [rawRows, setRawRows] = useState<StatementRow[]>([]);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [invoiceChoices, setInvoiceChoices] = useState<string[]>([]);
  const [imported, setImported] = useState<
    { id: string; created: boolean; settled: boolean }[]
  >([]);
  const [ocrConsent, setOcrConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requests = useRef(new Map<number, string>());
  const fileInput = useRef<HTMLInputElement>(null);
  function clearPreview() {
    setPreview([]);
    setImported([]);
    setReviewed(false);
    requests.current.clear();
  }
  function reset() {
    clearPreview();
    setDocumentId("");
    setMessage("");
  }
  async function pick(next: File | null) {
    reset();
    setTable([]);
    setRawRows([]);
    setFile(next);
    setError("");
    setOcrConsent(false);
    if (!next) return;
    try {
      if (
        !/\.(csv|pdf)$/i.test(next.name) ||
        !next.size ||
        next.size >
          (next.name.toLowerCase().endsWith(".csv")
            ? 2_000_000
            : 10 * 1024 * 1024)
      )
        throw new Error("En fazla 2 MB CSV veya 10 MB PDF seçin.");
      if (next.name.toLowerCase().endsWith(".csv")) {
        const bytes = await next.arrayBuffer();
        let text = new TextDecoder().decode(bytes);
        if (text.includes("\uFFFD"))
          text = new TextDecoder("windows-1252").decode(bytes);
        const parsed = csvTable(text);
        setTable(parsed);
        setColumns(guessColumns(parsed[0]));
      }
    } catch (reason) {
      setFile(null);
      setError((reason as Error).message);
    }
  }
  async function prepare() {
    setBusy(true);
    setError("");
    setMessage("");
    clearPreview();
    try {
      if (!file || !bankAccountId || !start || !end || start > end)
        throw new Error("Banka hesabı, dosya ve geçerli dönem seçin.");
      const pdf = file.name.toLowerCase().endsWith(".pdf");
      if (pdf && !ocrConsent)
        throw new Error("PDF’nin OCR servisine gönderilmesini onaylayın.");
      if (!pdf)
        assertCsvAccount(
          table,
          banks.find((a) => a.id === bankAccountId)?.iban,
        );
      let rows = pdf ? rawRows : csvRows(table, columns);
      if (!pdf && rows.some((r) => r.date < start || r.date > end))
        throw new Error(
          "CSV’de seçilen dönem dışında hareket var. Dönemi kontrol edin.",
        );
      let id = documentId;
      if (!id) {
        const metadata = {
          kind: "BANK_STATEMENT",
          entity: banks.find((a) => a.id === bankAccountId)?.name || "Banka",
          date: end,
          originalName: file.name,
          archiveFolder: "01_Bankkontoauszug",
        };
        const name = file.name.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(-100);
        const blob = await upload(
          `documents/files/${crypto.randomUUID()}/${name}`,
          file,
          {
            access: "private",
            contentType: pdf ? "application/pdf" : "text/csv",
            handleUploadUrl: "/api/documents/upload",
            clientPayload: JSON.stringify(metadata),
            multipart: file.size > 5 * 1024 * 1024,
          },
        );
        const saved = await post("/api/documents", {
          pathname: blob.pathname,
          metadata,
          sync: false,
        });
        id = saved.document.id;
        setDocumentId(id);
        setMessage("Ekstre özel arşive yüklendi.");
      }
      if (pdf && !rows.length) {
        const extracted = await post("/api/statements", {
          action: "extract",
          documentId: id,
          bankAccountId,
        });
        rows = extracted.rows;
        setRawRows(rows);
        const expected = banks
          .find((a) => a.id === bankAccountId)
          ?.iban?.replace(/\s/g, "")
          .toUpperCase();
        if (
          expected &&
          extracted.iban &&
          expected !== extracted.iban.replace(/\s/g, "").toUpperCase()
        ) {
          setDocumentId("");
          setRawRows([]);
          throw new Error("PDF’deki IBAN seçilen banka hesabıyla uyuşmuyor.");
        }
        if (extracted.warnings.length)
          setMessage(
            (current) =>
              `${current} OCR uyarıları: ${extracted.warnings.join("; ")}`,
          );
      }
      if (rows.some((r) => r.date < start || r.date > end))
        throw new Error(
          "Ekstrede seçilen dönem dışında hareket var. Dönemi kontrol edin.",
        );
      const result = await post("/api/statements", {
        action: "preview",
        documentId: id,
        bankAccountId,
        rows,
        columns,
      });
      try {
        const sync = await post("/api/documents/sync", { id });
        setMessage(
          (current) =>
            `${current} ${sync.document.syncStatus === "SYNCED" ? "OneDrive banka ekstresi klasörüne aktarıldı." : "OneDrive aktarımını Evrak Arşivi’nden yeniden deneyin."}`,
        );
      } catch {
        setMessage(
          (current) =>
            `${current} OneDrive aktarımı tamamlanamadı; Evrak Arşivi’nden tekrar deneyin.`,
        );
      }
      setPreview(result.rows);
      setChoices(
        result.rows.map(
          (r: Preview) =>
            r.duplicateId ||
            (r.candidates.length === 1 ? r.candidates[0].id : ""),
        ),
      );
      setInvoiceChoices(result.rows.map(() => ""));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!reviewed)
        throw new Error(
          "Hareketleri ve giriş/çıkış yönlerini inceleyip onaylayın.",
        );
      const result = await post("/api/statements", {
        action: "import",
        confirmed: true,
        documentId,
        bankAccountId,
        rows: preview,
        columns,
        resolutions: choices,
      });
      setImported(result.transactions);
      setMessage(
        `${result.transactions.filter((r: { created: boolean }) => r.created).length} yeni hareket kaydedildi; mevcut hareketler tekrar eklenmedi. Fatura ödemeleri için aşağıdaki eşleştirmeleri ayrıca onaylayın.`,
      );
      await onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function match(index: number) {
    setBusy(true);
    setError("");
    try {
      const row = preview[index],
        transaction = imported[index];
      const invoice = row.suggestions.find(
        (s) => s.id === invoiceChoices[index],
      );
      if (!invoice || !transaction || transaction.settled)
        throw new Error("Açık bir fatura ve eşleşmemiş hareket seçin.");
      if (!requests.current.has(index))
        requests.current.set(index, crypto.randomUUID());
      await post("/api/invoices/payments", {
        invoiceId: invoice.id,
        transactionId: transaction.id,
        paymentId: invoice.paymentId || undefined,
        method: "BANK",
        date: row.date,
        amount: Math.abs(Number(row.amount)).toFixed(2),
        reference: row.reference || row.description,
        requestId: requests.current.get(index),
      });
      setImported((current) =>
        current.map((r, i) =>
          r.id === transaction.id || i === index ? { ...r, settled: true } : r,
        ),
      );
      setMessage(
        "Banka ödemesi faturaya bağlandı. Açık/kısmi/kapalı durumu güncellendi.",
      );
      await onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`${panelClass} mb-6`}>
      <h2 className="text-xl font-semibold">
        Banka ekstresi ve fatura eşleştirme
      </h2>
      <p className="my-3 text-sm text-zinc-400">
        Haftalık veya aylık CSV/PDF yükleyin. Ekstre kayıtları mutabakat
        içindir; hesap bakiyesine tekrar eklenmez, ciro veya yeni gider
        oluşturmaz. Güncel bakiye hesap kaydından izlenir.
      </p>
      <p className="my-3 text-sm text-zinc-400">
        Berliner Sparkasse: Umsätze → Zeitraum → Export. Yalnızca kesinleşmiş
        (gebuchte) hareketleri içeren CSV’yi veya PDF hesap ekstresini seçin.
        Buchungstag, Betrag ve Verwendungszweck sütunları otomatik tanınır.
      </p>
      <Notice error={error} message={message} />
      <p className="mb-4 text-sm text-zinc-400">
        Yükleme için{" "}
        <a className="underline" href="/api/integrations/onedrive/start">
          kişisel Microsoft hesabınızla bağlantı
        </a>{" "}
        gerekir.
      </p>
      {!banks.length ? (
        <p className="text-amber-300">
          Önce BANK türünde bir banka hesabı ekleyin.
        </p>
      ) : (
        <>
          <fieldset
            disabled={busy || imported.length > 0}
            className="grid gap-4 md:grid-cols-3 disabled:opacity-70"
          >
            <Field label="Banka hesabı">
              <select
                className={inputClass}
                value={bankAccountId}
                onChange={(e) => {
                  setSelectedAccount(e.target.value);
                  setRawRows([]);
                  reset();
                }}
              >
                {banks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ekstre sıklığı">
              <select
                className={inputClass}
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value);
                  const day = new Date(`${start}T00:00:00Z`);
                  if (e.target.value === "WEEK")
                    day.setUTCDate(day.getUTCDate() + 6);
                  else {
                    day.setUTCMonth(day.getUTCMonth() + 1, 0);
                  }
                  setEnd(day.toISOString().slice(0, 10));
                  reset();
                }}
              >
                <option value="MONTH">Aylık</option>
                <option value="WEEK">Haftalık</option>
              </select>
            </Field>
            <Field label="Dosya">
              <input
                className={inputClass}
                ref={fileInput}
                type="file"
                accept=".csv,.pdf"
                onChange={(e) => void pick(e.target.files?.[0] || null)}
              />
            </Field>
            <Field label="Dönem başlangıcı">
              <input
                className={inputClass}
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  reset();
                }}
              />
            </Field>
            <Field label="Dönem sonu / Arşiv ayı">
              <input
                className={inputClass}
                type="date"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  reset();
                }}
              />
            </Field>
          </fieldset>
          {table.length > 0 ? (
            <fieldset
              disabled={busy || imported.length > 0}
              className="my-4 grid gap-3 md:grid-cols-3"
            >
              {(
                [
                  ["date", "İşlem tarihi"],
                  ["amount", "İşaretli EUR tutarı"],
                  ["description", "Açıklama / Ödeme amacı"],
                  ["counterparty", "Alıcı / Gönderen"],
                  ["reference", "İşlem referansı"],
                  ["direction", "Soll/Haben (isteğe bağlı)"],
                ] as const
              ).map(([key, label]) => (
                <Field label={label} key={key}>
                  <select
                    className={inputClass}
                    value={columns[key]}
                    onChange={(e) => {
                      setColumns({ ...columns, [key]: Number(e.target.value) });
                      clearPreview();
                    }}
                  >
                    <option value={-1}>Sütun seçilmedi</option>
                    {table[0].map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Sütun ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <p className="text-sm text-zinc-400 md:col-span-3">
                Tutar negatifse çıkış, pozitifse giriş. Ayrı Soll/Haben sütunu
                varsa seçin. EUR dışı hareketleri yüklemeyin.
              </p>
            </fieldset>
          ) : null}
          {file?.name.toLowerCase().endsWith(".pdf") ? (
            <label className="my-4 block text-sm">
              <input
                disabled={busy}
                type="checkbox"
                checked={ocrConsent}
                onChange={(e) => setOcrConsent(e.target.checked)}
              />{" "}
              Bu banka PDF’sinin Vercel AI Gateway üzerinden OCR için
              işlenmesini onaylıyorum.
            </label>
          ) : null}
          {!imported.length ? (
            <button
              type="button"
              className={`${buttonClass} my-4`}
              disabled={busy || !file}
              onClick={() => void prepare()}
            >
              {busy ? "İşleniyor…" : "Yükle ve eşleştirme önizlemesi hazırla"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={`${buttonClass} my-4`}
              onClick={() => {
                reset();
                setFile(null);
                setTable([]);
                setRawRows([]);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Yeni ekstre
            </button>
          )}
          {preview.length > 0 ? (
            <>
              <p className="my-3 text-sm">
                {preview.length} hareket · Giriş:{" "}
                {formatMoney(
                  preview
                    .filter((r) => Number(r.amount) > 0)
                    .reduce((s, r) => s + Number(r.amount), 0),
                )}{" "}
                · Çıkış:{" "}
                {formatMoney(
                  preview
                    .filter((r) => Number(r.amount) < 0)
                    .reduce((s, r) => s - Number(r.amount), 0),
                )}
              </p>
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-2">Tarih / Açıklama</th>
                      <th className="p-2">EUR</th>
                      <th className="p-2">Banka kaydı</th>
                      <th className="p-2">Fatura ödemesi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={index} className="border-t border-zinc-800">
                        <td className="max-w-sm p-2">
                          {row.date}
                          <p className="text-zinc-400">{row.description}</p>
                          <p className="text-xs">{row.reference}</p>
                        </td>
                        <td
                          className={`p-2 ${Number(row.amount) < 0 ? "text-amber-300" : "text-emerald-300"}`}
                        >
                          {formatMoney(Number(row.amount))}
                        </td>
                        <td className="p-2">
                          {row.duplicateId ? (
                            "Zaten kayıtlı"
                          ) : imported[index] ? (
                            imported[index].created ? (
                              "Eklendi"
                            ) : (
                              "Mevcut kayıt kullanıldı"
                            )
                          ) : row.candidates.length ? (
                            <select
                              aria-label={`${index + 1}. hareket banka kaydı`}
                              disabled={busy}
                              className={inputClass}
                              value={choices[index]}
                              onChange={(e) => {
                                setChoices((current) =>
                                  current.map((v, i) =>
                                    i === index ? e.target.value : v,
                                  ),
                                );
                                setReviewed(false);
                              }}
                            >
                              <option value="">
                                Aynı tarih/tutar: kontrol edin
                              </option>
                              {row.candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.description ||
                                    c.source ||
                                    "Mevcut hareket"}
                                  {c.settled ? " (eşleşmiş)" : ""}
                                </option>
                              ))}
                              <option value="NEW">
                                Farklı hareket: yeni kayıt oluştur
                              </option>
                            </select>
                          ) : (
                            "Yeni kayıt"
                          )}
                        </td>
                        <td className="min-w-64 p-2">
                          {Number(row.amount) > 0 ? (
                            "Giriş / Transfer: fatura ödemesi değil"
                          ) : imported[index]?.settled || row.settled ? (
                            "Ödemeyle eşleşmiş"
                          ) : (
                            <>
                              <select
                                aria-label={`${index + 1}. hareket fatura`}
                                className={inputClass}
                                disabled={busy}
                                value={invoiceChoices[index] || ""}
                                onChange={(e) => {
                                  setInvoiceChoices((current) =>
                                    current.map((v, i) =>
                                      i === index ? e.target.value : v,
                                    ),
                                  );
                                  requests.current.delete(index);
                                }}
                              >
                                <option value="">
                                  Fatura seçin / Eşleşmeden bırak
                                </option>
                                {row.suggestions.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.strong ? "★ " : ""}
                                    {s.label} ·{" "}
                                    {s.paymentId
                                      ? "Mevcut manuel ödeme"
                                      : formatMoney(s.remaining)}
                                  </option>
                                ))}
                              </select>
                              {imported[index] ? (
                                <button
                                  type="button"
                                  className="mt-2 underline"
                                  disabled={busy || !invoiceChoices[index]}
                                  onClick={() => void match(index)}
                                >
                                  Ödemeyi faturayla eşleştir
                                </button>
                              ) : null}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!imported.length ? (
                <>
                  <label className="my-4 block text-sm">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />{" "}
                    Ekstrenin bütün hareketlerini, tutarlarını, yönlerini ve
                    mevcut kayıt seçimlerini kontrol ettim; bütün tutarlar EUR.
                  </label>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      busy ||
                      !reviewed ||
                      preview.some(
                        (r, i) =>
                          !r.duplicateId &&
                          r.candidates.length > 0 &&
                          !choices[i],
                      )
                    }
                    onClick={() => void save()}
                  >
                    Ekstre hareketlerini onayla ve kaydet
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
