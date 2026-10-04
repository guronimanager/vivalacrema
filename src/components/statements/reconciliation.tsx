"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buttonClass,
  inputClass,
  Notice,
  panelClass,
} from "@/components/finance/ui";
import { dateLabel, money } from "@/lib/finance";
type Suggestion = {
  id: string;
  label: string;
  remaining: number;
  paymentId: string | null;
  strong: boolean;
};
type Record = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  accountName: string;
  matchedInvoice: string | null;
  suggestions: Suggestion[];
};
export function StatementReconciliation({
  month,
  account,
  refreshVersion,
  onSaved,
}: {
  month: string;
  account: string;
  refreshVersion: number;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState("ALL"),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [records, setRecords] = useState<Record[]>([]),
    [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [choices, setChoices] = useState<{ [key: string]: string }>({});
  const requestIds = useRef(new Map<string, string>());
  const query = useCallback(
    () =>
      new URLSearchParams({
        month,
        account,
        status,
        page: String(page),
      }).toString(),
    [month, account, status, page],
  );
  const requestKey = `${query()}:${refreshVersion}:${revision}`;
  const loading = loadedKey !== requestKey;
  const visibleRecords = loading ? [] : records;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/statements/reconciliation?${query()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success)
          throw new Error(data.message || "Eşleştirmeler alınamadı.");
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRecords(data.records);
          setHasMore(data.hasMore);
          setChoices({});
          setError("");
          setLoadedKey(requestKey);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason.message);
          setRecords([]);
          setHasMore(false);
          setLoadedKey(requestKey);
        }
      });
    return () => controller.abort();
  }, [query, requestKey]);
  async function match(row: Record) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const invoice = row.suggestions.find((s) => s.id === choices[row.id]);
      if (!invoice) throw new Error("Fatura seçin.");
      const key = `${row.id}:${invoice.id}`;
      if (!requestIds.current.has(key))
        requestIds.current.set(key, crypto.randomUUID());
      const response = await fetch("/api/statements/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: row.id,
          invoiceId: invoice.id,
          paymentId: invoice.paymentId || undefined,
          requestId: requestIds.current.get(key),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.message || "Eşleştirme tamamlanamadı.");
      setMessage(
        "Ödeme faturaya bağlandı; açık borç güncellendi. Yeni banka hareketi veya gider oluşturulmadı.",
      );
      setRevision((v) => v + 1);
      await onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Eşleştirme tamamlanamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`${panelClass} mb-6`}>
      <h2 className="text-xl font-semibold">
        Kayıtlı hareketleri faturayla eşleştir
      </h2>
      <p className="my-3 text-sm text-zinc-400">
        Ekstreyi fatura seçmeden onaylayabilirsiniz. Daha sonra bu bölümden
        eşleştirmeyi tamamlayın. Üstteki dönem ve hesap filtreleri burada da
        geçerlidir. Faturayı sonradan eklediğinizde Yenile’ye basın. Eşleştirme
        için Banka ve Giderler düzenleme yetkisi gerekir.
      </p>
      <Notice error={loading ? "" : error} message={message} />
      <div className="my-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Kayıtlı hareket eşleştirme durumu"
          className={inputClass}
          disabled={busy}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="ALL">Tüm banka çıkışları</option>
          <option value="PENDING">Eşleştirme bekleyen</option>
          <option value="MATCHED">Eşleşmiş</option>
        </select>
        <button
          type="button"
          className={buttonClass}
          disabled={loading || busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          Eşleştirmeleri yenile
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Tarih / Hesap / Açıklama</th>
              <th className="p-2">Çıkış</th>
              <th className="p-2">Fatura eşleştirmesi</th>
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((row) => (
              <tr key={row.id} className="border-t border-zinc-800">
                <td className="p-2 max-w-sm">
                  {dateLabel(row.date)} · {row.accountName}
                  <p className="text-zinc-400">{row.description}</p>
                </td>
                <td className="p-2">{money(row.amount)}</td>
                <td className="p-2 min-w-64">
                  {row.matchedInvoice ? (
                    <span>Eşleşmiş: {row.matchedInvoice}</span>
                  ) : row.suggestions.length ? (
                    <>
                      <select
                        aria-label={`${row.description || row.date} için fatura`}
                        className={inputClass}
                        disabled={busy || loading}
                        value={choices[row.id] || ""}
                        onChange={(e) =>
                          setChoices((values) => ({
                            ...values,
                            [row.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">
                          Fatura seçin / Daha sonra eşleştir
                        </option>
                        {row.suggestions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.strong ? "★ " : ""}
                            {s.label} ·{" "}
                            {s.paymentId
                              ? "Mevcut manuel ödeme"
                              : `Açık: ${money(s.remaining)}`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="mt-2 underline"
                        disabled={busy || loading || !choices[row.id]}
                        onClick={() => void match(row)}
                      >
                        Ödemeyi faturayla eşleştir
                      </button>
                    </>
                  ) : (
                    <span className="text-zinc-400">
                      Uygun fatura yok. Faturayı Giderler’den ekleyip yenileyin;
                      eşleştirmeyi daha sonra tamamlayabilirsiniz.
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!visibleRecords.length ? (
              <tr>
                <td colSpan={3} className="p-4 text-zinc-400">
                  {loading
                    ? "Yükleniyor…"
                    : error
                      ? "Kayıtlar gösterilemiyor."
                      : "Seçili filtrelerde banka çıkışı yok."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-3 items-center">
        <button
          type="button"
          className={buttonClass}
          disabled={loading || busy || page === 0}
          onClick={() => setPage((v) => v - 1)}
        >
          Önceki
        </button>
        <span>Sayfa {page + 1}</span>
        <button
          type="button"
          className={buttonClass}
          disabled={loading || busy || !hasMore}
          onClick={() => setPage((v) => v + 1)}
        >
          Sonraki
        </button>
      </div>
    </section>
  );
}
