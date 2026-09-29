"use client";

import { useEffect, useState } from "react";
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

type DashboardData = {
  success: boolean;
  period: {
    start: string;
    end: string;
    label: string;
  };
  revenue: number;
  expenses: number;
  netProfit: number;
  sales: {
    cash: number;
    card: number;
    online: number;
  };
  bankBalance: number;
  cashBalance: number;
  sumupBalance: number;
  totalLiquidity: number;
  expenseBreakdown: {
    manual: number;
    sumupFees: number;
  };
  expenseCategories: Record<string, number>;
  chart: {
    day: number;
    label: string;
    revenue: number;
    expenses: number;
  }[];
};


function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Dashboard verileri alınamadı");
        }

        const result: DashboardData = await response.json();
        if (!result.success) {
          throw new Error("Dashboard verileri alınamadı");
        }

        setData(result);
      } catch (err) {
        console.error(err);
        setError("Dashboard verileri yüklenemedi.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const periodLabel = data?.period.label ?? "Dönem bilgisi bekleniyor";
  const salesTotal = (data?.sales.cash ?? 0) + (data?.sales.card ?? 0);

  const stats = [
    {
      title: "Aylık Ciro",
      value: loading ? "..." : money(data?.revenue ?? 0),
      subtitle: periodLabel,
    },
    {
      title: "Aylık Gider",
      value: loading ? "..." : money(data?.expenses ?? 0),
      subtitle: periodLabel,
    },
    {
      title: "Net Sonuç",
      value: loading ? "..." : money(data?.netProfit ?? 0),
      subtitle: "Ciro - kayıtlı giderler",
    },
    {
      title: "Toplam Likidite",
      value: loading ? "..." : money(data?.totalLiquidity ?? 0),
      subtitle: "Banka + kasa + SumUp",
    },
  ];
  
  const expenseRows = Object.entries(
  data?.expenseCategories ?? {}
)
  .map(([label, value]) => ({
    label,
    value,
  }))
  .sort((a, b) => b.value - a.value);

  return (
    <div className="min-h-screen flex-1 bg-zinc-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            İşletme Yönetim Paneli
          </p>

          <h2 className="mt-1 text-3xl font-semibold">
            Genel Bakış
          </h2>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300">
          {loading ? "Yükleniyor..." : periodLabel}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && <p role="status" className="mb-6 text-sm text-zinc-400">Dashboard yükleniyor...</p>}

      {data && <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <p className="text-sm text-zinc-500">
              {stat.title}
            </p>

            <p className="mt-3 text-2xl font-semibold">
              {stat.value}
            </p>

            <p className="mt-2 text-xs text-zinc-500">
              {stat.subtitle}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 xl:col-span-2">
          <div className="mb-6">
            <p className="text-sm text-zinc-500">
              Performans
            </p>

            <h3 className="text-xl font-semibold">
              Günlük Gelir / Gider
            </h3>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chart ?? []}>
                <defs>
                  <linearGradient
                    id="gelir"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#ffffff"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#ffffff"
                      stopOpacity={0}
                    />
                  </linearGradient>

                  <linearGradient
                    id="gider"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#71717a"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#71717a"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="#27272a"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  stroke="#71717a"
                />

                <YAxis stroke="#71717a" tickFormatter={(value: number) => money(value)} width={95} />

                <Legend />

                <Tooltip
                  formatter={(value) => money(Number(value ?? 0))}
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "12px",
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Gelir"
                  stroke="#ffffff"
                  fill="url(#gelir)"
                  strokeWidth={2}
                />

                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Gider"
                  stroke="#71717a"
                  fill="url(#gider)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">
            TillHub Satış Dağılımı
          </p>

          <h3 className="mb-6 text-xl font-semibold">
            Ödeme Tipleri
          </h3>

          <div className="space-y-5">
            <PaymentRow
              label="Nakit"
              value={data?.sales.cash ?? 0}
              total={salesTotal}
            />

            <PaymentRow
              label="Kart"
              value={data?.sales.card ?? 0}
              total={salesTotal}
            />

            {salesTotal === 0 && <p className="text-sm text-zinc-500">Bu dönemde TillHub satışı yok.</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
      
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
  <p className="text-sm text-zinc-500">
    Gider Dağılımı
  </p>

  <h3 className="mb-6 text-xl font-semibold">
    Kategoriler
  </h3>

  <div className="space-y-4">
    {expenseRows.length > 0 ? (
      expenseRows.map((item, index) => (
        <SummaryRow
          key={item.label}
          label={item.label}
          value={item.value}
          last={index === expenseRows.length - 1}
        />
      ))
    ) : (
      <p className="text-sm text-zinc-500">
        Bu dönemde kayıtlı gider yok.
      </p>
    )}
  </div>
</div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">
            Finans
          </p>

          <h3 className="mb-6 text-xl font-semibold">
            Gider Özeti
          </h3>

          <div className="space-y-4">
            <SummaryRow
              label="Kayıtlı Giderler"
              value={data?.expenseBreakdown.manual ?? 0}
            />

            <SummaryRow
              label="SumUp Komisyonu"
              value={data?.expenseBreakdown.sumupFees ?? 0}
            />

            <SummaryRow
              label="Toplam Gider"
              value={data?.expenses ?? 0}
              last
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">
            Finansal Durum
          </p>

          <h3 className="mb-6 text-xl font-semibold">
            {periodLabel}
          </h3>

          <div className="space-y-4">
            <SummaryRow
              label="Banka Bakiyesi"
              value={data?.bankBalance ?? 0}
            />

            <SummaryRow
              label="Nakit Kasa"
              value={data?.cashBalance ?? 0}
            />

            <SummaryRow
              label="SumUp Bakiyesi"
              value={data?.sumupBalance ?? 0}
            />

            <SummaryRow
              label="SumUp Komisyonu"
              value={data?.expenseBreakdown?.sumupFees ?? 0}
              last
            />
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

function PaymentRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percentage = total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;

  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-zinc-400">
          {money(value)} · %{percentage.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
        <div className="h-full rounded-full bg-zinc-300" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: number;
  last?: boolean;
}) {
  return (
    <div
      className={`flex justify-between pb-4 ${
        last
          ? ""
          : "border-b border-zinc-800"
      }`}
    >
      <span>{label}</span>
      <strong>{money(value)}</strong>
    </div>
  );
}
