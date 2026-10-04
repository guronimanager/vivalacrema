"use client";
import { ArchiveAuditReport } from "@/components/reports/archive-audit";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FinancePage,
  Notice,
  Stat,
  buttonClass,
  panelClass,
} from "@/components/finance/ui";
import { money, csvText, revenueReconciliation } from "@/lib/finance";

type Report = {
  success: boolean;
  period: { start: string; end: string; label: string };
  revenue: number;
  expenses: number;
  netProfit: number;
  bankBalance: number;
  cashBalance: number;
  sumupBalance: number;
  totalLiquidity: number;
  expenseBreakdown: { manual: number; sumupFees: number };
  expenseCategories: Record<string, number>;
  chart: { day: number; label: string; revenue: number; expenses: number }[];
};

function download(filename: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      fetch("/api/dashboard", { cache: "no-store" })
        .then(async (response) => {
          const result: Report = await response.json();
          if (!response.ok || !result.success) throw new Error();
          setError("");
          setReport(result);
        })
        .catch(() => {
          setReport(null);
          setError("Aylık rapor yüklenemedi. Yeniden deneyin.");
        })
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setLoading(true);
    setError("");
    await load();
  }

  const reconciliation = report
    ? revenueReconciliation(report.revenue, report.chart)
    : null;

  return (
    <FinancePage
      title="Raporlar"
      description="TillHub cirosu ve sisteme kaydedilmiş giderlerden oluşan güncel aylık rapor. Net Sonuç kesin muhasebe net kârı değildir. Manuel satış kayıtları TillHub cirosuna eklenmez; SumUp payout gelir sayılmaz."
    >
      <Notice error={error} />
      {reconciliation && reconciliation.difference !== 0 && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-amber-900 p-4 text-sm text-amber-300"
        >
          TillHub aylık ödeme raporu ile günlük işlem raporu arasında{" "}
          {money(reconciliation.difference)} fark var. Günlük işlem gelir
          toplamı: {money(reconciliation.dailyTotal)}. Aylık ciro kartı ödeme
          raporunu esas alır; günlük tablo ve CSV işlem raporunu gösterir.
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {report?.period.label ?? "Aylık Rapor"}
        </h2>
        <button
          className={buttonClass}
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
      </div>
      {loading && (
        <p role="status" className="text-zinc-400">
          Rapor hazırlanıyor...
        </p>
      )}
      {!loading && report && (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Aylık Ciro" value={money(report.revenue)} />
            <Stat label="Aylık Gider" value={money(report.expenses)} />
            <Stat label="Net Sonuç" value={money(report.netProfit)} />
            <Stat
              label="Toplam Likidite"
              value={money(report.totalLiquidity)}
            />
          </div>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Güncel Banka Bakiyesi"
              value={money(report.bankBalance)}
            />
            <Stat label="Güncel Nakit Kasa" value={money(report.cashBalance)} />
            <Stat
              label="Güncel SumUp Bakiyesi"
              value={money(report.sumupBalance)}
            />
            <Stat
              label="Aylık SumUp Komisyonu"
              value={money(report.expenseBreakdown.sumupFees)}
            />
          </div>
          <div className={`${panelClass} mb-6`}>
            <h2 className="mb-5 text-xl font-semibold">Günlük Gelir / Gider</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.chart}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" stroke="#71717a" />
                  <YAxis
                    width={95}
                    stroke="#71717a"
                    tickFormatter={(value: number) => money(value)}
                  />
                  <Tooltip
                    formatter={(value) => money(Number(value ?? 0))}
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: 12,
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Gelir"
                    stroke="#a7f3d0"
                    fill="#064e3b"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Gider"
                    stroke="#fca5a5"
                    fill="#7f1d1d"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className={panelClass}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Günlük Hareketler</h2>
                <button
                  className={buttonClass}
                  onClick={() =>
                    download(`gunluk-rapor-${report.period.label}.csv`, [
                      [
                        "Dönem",
                        "Gün",
                        "Gelir (EUR)",
                        "Gider (EUR)",
                        "Net Sonuç (EUR)",
                      ],
                      ...report.chart.map((day) => [
                        report.period.label,
                        day.label,
                        day.revenue.toFixed(2),
                        day.expenses.toFixed(2),
                        (day.revenue - day.expenses).toFixed(2),
                      ]),
                    ])
                  }
                >
                  CSV İndir
                </button>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {["Gün", "Gelir", "Gider", "Net Sonuç"].map((label) => (
                        <th key={label} className="px-2 py-3">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.chart.map((day) => (
                      <tr key={day.day} className="border-t border-zinc-800">
                        <td className="px-2 py-3">{day.label}</td>
                        <td className="px-2 py-3">{money(day.revenue)}</td>
                        <td className="px-2 py-3">{money(day.expenses)}</td>
                        <td className="px-2 py-3">
                          {money(day.revenue - day.expenses)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={panelClass}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Gider Kategorileri</h2>
                <button
                  className={buttonClass}
                  onClick={() =>
                    download(`gider-raporu-${report.period.label}.csv`, [
                      ["Dönem", "Kategori", "Tutar (EUR)"],
                      ...Object.entries(report.expenseCategories).map(
                        ([category, amount]) => [
                          report.period.label,
                          category,
                          amount.toFixed(2),
                        ],
                      ),
                    ])
                  }
                >
                  CSV İndir
                </button>
              </div>
              <p className="mb-4 text-sm text-zinc-400">
                Kayıtlı manuel gider: {money(report.expenseBreakdown.manual)} ·
                SumUp komisyonu: {money(report.expenseBreakdown.sumupFees)}
              </p>
              {Object.entries(report.expenseCategories)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => (
                  <div
                    key={category}
                    className="flex justify-between border-b border-zinc-800 py-3 last:border-0"
                  >
                    <span>{category}</span>
                    <span>{money(amount)}</span>
                  </div>
                ))}
              {!Object.keys(report.expenseCategories).length && (
                <p className="text-zinc-500">Bu dönemde kayıtlı gider yok.</p>
              )}
            </div>
          </div>
        </>
      )}
      <ArchiveAuditReport />
    </FinancePage>
  );
}
