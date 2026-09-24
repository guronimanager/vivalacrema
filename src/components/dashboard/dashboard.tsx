"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartData = [
  { name: "1 Eyl", gelir: 24000, gider: 18000 },
  { name: "5 Eyl", gelir: 31000, gider: 21000 },
  { name: "10 Eyl", gelir: 28000, gider: 19000 },
  { name: "15 Eyl", gelir: 39000, gider: 25000 },
  { name: "20 Eyl", gelir: 36000, gider: 23000 },
  { name: "25 Eyl", gelir: 44000, gider: 29000 },
  { name: "30 Eyl", gelir: 47000, gider: 31000 },
];

const stats = [
  {
    title: "Aylık Ciro",
    value: "₺850.000",
    change: "+12,4%",
  },
  {
    title: "Brüt Kâr",
    value: "₺510.000",
    change: "+8,2%",
  },
  {
    title: "Net Kâr",
    value: "₺126.000",
    change: "+5,7%",
  },
  {
    title: "Nakit + Banka",
    value: "₺259.400",
    change: "+3,1%",
  },
];

const expenses = [
  { label: "Hammadde", value: "₺210.000", width: "82%" },
  { label: "Personel", value: "₺180.000", width: "70%" },
  { label: "Kira", value: "₺70.000", width: "35%" },
  { label: "Vergiler", value: "₺58.000", width: "29%" },
  { label: "Diğer", value: "₺42.000", width: "22%" },
];

const transactions = [
  { label: "Günlük satış", value: "+₺31.850", positive: true },
  { label: "Tedarikçi ödemesi", value: "-₺12.400", positive: false },
  { label: "Elektrik faturası", value: "-₺8.250", positive: false },
  { label: "Online satış", value: "+₺5.500", positive: true },
];

export function Dashboard() {
  return (
    <div className="min-h-screen flex-1 bg-zinc-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">İşletme Yönetim Paneli</p>
          <h2 className="mt-1 text-3xl font-semibold">Genel Bakış</h2>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300">
          Eylül 2026
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <p className="text-sm text-zinc-500">{stat.title}</p>
            <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
            <p className="mt-2 text-sm text-emerald-400">{stat.change}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 xl:col-span-2">
          <div className="mb-6">
            <p className="text-sm text-zinc-500">Performans</p>
            <h3 className="text-xl font-semibold">Gelir / Gider</h3>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gelir" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gider" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#71717a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" />
                <YAxis stroke="#71717a" />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="gelir"
                  stroke="#ffffff"
                  fill="url(#gelir)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="gider"
                  stroke="#71717a"
                  fill="url(#gider)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">Dağılım</p>
          <h3 className="mb-6 text-xl font-semibold">Giderler</h3>

          <div className="space-y-5">
            {expenses.map((expense) => (
              <div key={expense.label}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{expense.label}</span>
                  <span className="text-zinc-400">{expense.value}</span>
                </div>

                <div className="h-2 rounded-full bg-zinc-800">
                  <div
                    className="h-2 rounded-full bg-white"
                    style={{ width: expense.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">Finans</p>
          <h3 className="mb-6 text-xl font-semibold">Banka & Kasa</h3>

          <div className="space-y-4">
            <div className="flex justify-between border-b border-zinc-800 pb-4">
              <span>İş Bankası</span>
              <strong>₺145.000</strong>
            </div>
            <div className="flex justify-between border-b border-zinc-800 pb-4">
              <span>Garanti BBVA</span>
              <strong>₺86.000</strong>
            </div>
            <div className="flex justify-between">
              <span>Nakit Kasa</span>
              <strong>₺28.400</strong>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">Hareketler</p>
          <h3 className="mb-6 text-xl font-semibold">Son İşlemler</h3>

          <div className="space-y-4">
            {transactions.map((transaction) => (
              <div
                key={transaction.label}
                className="flex justify-between border-b border-zinc-800 pb-4 last:border-0"
              >
                <span>{transaction.label}</span>

                <span
                  className={
                    transaction.positive
                      ? "text-emerald-400"
                      : "text-red-400"
                  }
                >
                  {transaction.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
