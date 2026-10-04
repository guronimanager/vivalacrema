"use client";
import { useState } from "react";
import {
  buttonClass,
  inputClass,
  Notice,
  panelClass,
} from "@/components/finance/ui";
import { money } from "@/lib/finance";
type Audit = {
  year: string;
  capturedAt: string;
  transactions: {
    date: string;
    type: string;
    accountType: string | null;
    source: string | null;
    invoiceId: string | null;
    amount: string;
  }[];
  invoices: {
    date: string;
    totalAmount: string;
    payments: { amount: string }[];
  }[];
  expenses: { date: string; amount: string; invoiceId: string | null }[];
  documents: { archivePeriod?: string; date: string }[];
};
function cents(value: string) {
  return Math.round(Number(value) * 100);
}
export function ArchiveAuditReport() {
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [data, setData] = useState<Audit | null>(null);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    setData(null);
    setRaw("");
    try {
      const response = await fetch(
        `/api/documents/audit?year=${encodeURIComponent(year)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Yıllık kayıtlar alınamadı.");
      setData(result);
      setRaw(JSON.stringify(result, null, 2));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Yıllık kayıtlar alınamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `VLC-${data?.year}-kayit-denetimi.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-semibold">
        Evrak ve ödeme kayıtları — yıllık kontrol
      </h2>
      <p className="mt-3 text-sm text-zinc-400">
        01.01–31.12 dönemindeki portal kayıtlarını ay ay kontrol edin. Bu rapor
        OneDrive’daki henüz tanıtılmamış dosyaları içermez. Eksik evrak
        araştırması için OneDrive dosya envanteriyle karşılaştırılmalıdır. Salt
        okunur; ödeme veya gider oluşturmaz. Arşiv, Banka ve Giderler erişimi
        gerekir.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Rapor yılı
          <input
            type="number"
            min="1900"
            max="2199"
            value={year}
            disabled={busy}
            className={inputClass}
            onChange={(event) => {
              setYear(event.target.value);
              setData(null);
              setRaw("");
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className={buttonClass}
          onClick={() => void load()}
        >
          {busy ? "Kayıtlar okunuyor…" : "Yıllık kayıt listesini getir"}
        </button>
        {data ? (
          <button type="button" className={buttonClass} onClick={download}>
            Detaylı kayıt listesini indir
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        <Notice error={error} />
      </div>
      {data ? (
        <>
          <p className="mt-4 text-sm text-zinc-400">
            Kayıt anı: {new Date(data.capturedAt).toLocaleString("tr-TR")}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Ay",
                    "Portal evrakı",
                    "Kayıtlı fatura",
                    "Fatura toplamı",
                    "Banka çıkışı",
                    "Faturaya bağlı",
                    "Bağsız banka çıkışı",
                    "Faturasız gider",
                  ].map((label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, index) => {
                  const period = `${data.year}-${String(index + 1).padStart(2, "0")}`;
                  const bank = data.transactions.filter(
                    (t) =>
                      t.date.startsWith(period) &&
                      t.type === "EXPENSE" &&
                      t.accountType === "BANK" &&
                      t.source !== "sumup",
                  );
                  const invoices = data.invoices.filter((i) =>
                    i.date.startsWith(period),
                  );
                  return (
                    <tr key={period} className="border-t border-zinc-800">
                      <td className="p-3">{period}</td>
                      <td className="p-3">
                        {
                          data.documents.filter(
                            (d) =>
                              (d.archivePeriod || d.date.slice(0, 7)) ===
                              period,
                          ).length
                        }
                      </td>
                      <td className="p-3">{invoices.length}</td>
                      <td className="p-3">
                        {money(
                          invoices.reduce(
                            (sum, i) => sum + cents(i.totalAmount),
                            0,
                          ) / 100,
                        )}
                      </td>
                      <td className="p-3">{bank.length}</td>
                      <td className="p-3">
                        {bank.filter((t) => t.invoiceId).length}
                      </td>
                      <td className="p-3">
                        {bank.filter((t) => !t.invoiceId).length}
                      </td>
                      <td className="p-3">
                        {
                          data.expenses.filter(
                            (e) => e.date.startsWith(period) && !e.invoiceId,
                          ).length
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Bağsız banka çıkışları arasında vergi, maaş veya başka ödeme türleri
            de olabilir; tamamı eksik tedarikçi faturası anlamına gelmez.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer underline">
              Detaylı kayıtlar (JSON)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
              {raw}
            </pre>
          </details>
        </>
      ) : null}
    </section>
  );
}
