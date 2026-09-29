"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  FinancePage,
  Field,
  Notice,
  Stat,
  inputClass,
  buttonClass,
  panelClass,
} from "@/components/finance/ui";
import {
  money,
  today,
  dateLabel,
  sumMoney,
  revenueReconciliation,
} from "@/lib/finance";

type Sale = {
  id: string;
  date: string;
  cash: number;
  card: number;
  online: number;
  total: number;
  source: string | null;
};
type TillhubSummary = {
  success: boolean;
  period: { label: string; start: string; end: string };
  revenue: number;
  sales: { cash: number; card: number };
  chart: { day: number; label: string; revenue: number }[];
};

export default function SalesPage() {
  const [summary, setSummary] = useState<TillhubSummary | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualError, setManualError] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [online, setOnline] = useState("");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        fetch("/api/dashboard", { cache: "no-store" })
          .then(async (response) => {
            const result: TillhubSummary = await response.json();
            if (!response.ok || !result.success) throw new Error();
            setError("");
            setSummary(result);
          })
          .catch(() => {
            setSummary(null);
            setError("TillHub satışları yüklenemedi. Yeniden deneyin.");
          }),
        fetch("/api/sales", { cache: "no-store" })
          .then(async (response) => {
            const result: { success: boolean; sales: Sale[] } =
              await response.json();
            if (!response.ok || !result.success) throw new Error();
            setManualError("");
            setSales(
              result.sales.filter(
                (sale) => sale.source === "manual" || !sale.source,
              ),
            );
          })
          .catch(() => setManualError("Manuel satış kayıtları yüklenemedi.")),
      ]).then(() => setDataLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setDataLoading(true);
    setError("");
    await load();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setMessage("");
    const amounts = [cash, card, online].map((value) => Number(value || 0));
    if (
      amounts.some((value) => !Number.isFinite(value) || value < 0) ||
      sumMoney(amounts) <= 0
    ) {
      setMessage("En az bir pozitif satış tutarı girin.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cash: amounts[0],
          card: amounts[1],
          online: amounts[2],
          date,
          source: "manual",
        }),
      });
      const result: { success: boolean } = await response.json();
      if (!response.ok || !result.success) throw new Error();
      setCash("");
      setCard("");
      setOnline("");
      setMessage("Manuel satış kaydedildi. TillHub cirosuna eklenmedi.");
      await refresh();
    } catch {
      setMessage(
        "Satış kaydedilemedi. Yeniden denemeden önce kayıt listesini kontrol edin.",
      );
    } finally {
      setSaving(false);
    }
  }

  const visibleSales = sales.filter(
    (sale) => !month || sale.date.slice(0, 7) === month,
  );
  const manualTotal = sumMoney(visibleSales.map((sale) => sale.total));
  const reconciliation = summary
    ? revenueReconciliation(summary.revenue, summary.chart)
    : null;
  const pending = dataLoading ? "Yükleniyor..." : "—";

  return (
    <FinancePage
      title="Satışlar"
      description="Cironun ana kaynağı TillHub'dur. Manuel kayıtlar ayrı takip edilir; aynı satışın iki kez sayılmaması için TillHub toplamına eklenmez. SumUp tahsilatları satış geliri değildir."
    >
      <Notice error={error} />
      {reconciliation && reconciliation.difference !== 0 && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-amber-900 p-4 text-sm text-amber-300"
        >
          TillHub rapor farkı: {money(reconciliation.difference)}. Aylık ciro
          ödeme raporundan, günlük tutarlar işlem raporundan gelir. Günlük işlem
          toplamı: {money(reconciliation.dailyTotal)}.
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          TillHub · {summary?.period.label ?? "Dönem bekleniyor"}
        </h2>
        <button
          className={buttonClass}
          disabled={dataLoading}
          onClick={() => void refresh()}
        >
          {dataLoading ? "Yükleniyor..." : "Yenile"}
        </button>
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat
          label="TillHub Aylık Ciro"
          value={summary && !dataLoading ? money(summary.revenue) : pending}
        />
        <Stat
          label="TillHub Nakit Satış"
          value={summary && !dataLoading ? money(summary.sales.cash) : pending}
        />
        <Stat
          label="TillHub Kart Satış"
          value={summary && !dataLoading ? money(summary.sales.card) : pending}
        />
      </div>
      <div className={`${panelClass} mb-6`}>
        <h2 className="mb-4 text-xl font-semibold">
          TillHub Günlük İşlem Raporu
        </h2>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-3">Gün</th>
                <th className="py-3 text-right">Ciro</th>
              </tr>
            </thead>
            <tbody>
              {!dataLoading &&
                summary?.chart.map((day) => (
                  <tr key={day.day} className="border-t border-zinc-800">
                    <td className="py-3">{day.label}</td>
                    <td className="py-3 text-right">{money(day.revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!summary && (
            <p className="py-4 text-zinc-500">
              {dataLoading
                ? "Satışlar yükleniyor..."
                : "TillHub verisi gösterilemiyor."}
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={submit} className={panelClass}>
          <h2 className="mb-5 text-xl font-semibold">Manuel Satış Ekle</h2>
          <div className="space-y-4">
            <Field label="Tarih">
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </Field>
            {[
              { label: "Nakit (EUR)", value: cash, setter: setCash },
              { label: "Kart (EUR)", value: card, setter: setCard },
              { label: "Online (EUR)", value: online, setter: setOnline },
            ].map((field) => (
              <Field key={field.label} label={field.label}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={field.value}
                  onChange={(event) => field.setter(event.target.value)}
                  className={inputClass}
                />
              </Field>
            ))}
            <p>
              Toplam:{" "}
              {money(
                sumMoney([
                  Number(cash || 0),
                  Number(card || 0),
                  Number(online || 0),
                ]),
              )}
            </p>
            <button className={buttonClass} disabled={saving}>
              {saving ? "Kaydediliyor..." : "Manuel Satış Kaydet"}
            </button>
            <Notice message={message} />
          </div>
        </form>
        <div className={`${panelClass} xl:col-span-2`}>
          <h2 className="mb-4 text-xl font-semibold">Manuel Satış Kayıtları</h2>
          <Notice error={manualError} />
          <Field label="Manuel kayıt dönemi">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className={inputClass}
            />
          </Field>
          <p className="my-4 text-zinc-400">
            Filtrelenen manuel toplam:{" "}
            {dataLoading || manualError ? "—" : money(manualTotal)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Tarih", "Nakit", "Kart", "Online", "Toplam"].map(
                    (label) => (
                      <th key={label} className="px-2 py-3">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {!manualError &&
                  visibleSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-zinc-800">
                      <td className="px-2 py-3">{dateLabel(sale.date)}</td>
                      <td className="px-2 py-3">{money(sale.cash)}</td>
                      <td className="px-2 py-3">{money(sale.card)}</td>
                      <td className="px-2 py-3">{money(sale.online)}</td>
                      <td className="px-2 py-3">{money(sale.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!visibleSales.length && (
              <p className="py-4 text-zinc-500">
                {dataLoading
                  ? "Kayıtlar yükleniyor..."
                  : manualError
                    ? "Kayıtlar gösterilemiyor."
                    : "Bu dönemde manuel satış yok."}
              </p>
            )}
          </div>
        </div>
      </div>
    </FinancePage>
  );
}
