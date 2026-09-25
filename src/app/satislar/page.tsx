"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";

type Sale = {
  id: string;
  date: string;
  cash: number;
  card: number;
  online: number;
  total: number;
  source: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(value);
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [online, setOnline] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSales() {
    const response = await fetch("/api/sales", {
      cache: "no-store",
    });

    const result = await response.json();

    if (result.success) {
      setSales(result.sales);
    }
  }

  useEffect(() => {
    loadSales();
  }, []);

  async function submitSale(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cash: Number(cash || 0),
          card: Number(card || 0),
          online: Number(online || 0),
          source: "manual",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.message ?? "Satış eklenemedi.");
        return;
      }

      setCash("");
      setCard("");
      setOnline("");
      setMessage("Satış başarıyla kaydedildi.");

      await loadSales();
    } catch {
      setMessage("Sunucu bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  const totalSales = sales.reduce(
    (sum, sale) => sum + sale.total,
    0
  );

  const totalCash = sales.reduce(
    (sum, sale) => sum + sale.cash,
    0
  );

  const totalCard = sales.reduce(
    (sum, sale) => sum + sale.card,
    0
  );

  const totalOnline = sales.reduce(
    (sum, sale) => sum + sale.online,
    0
  );

  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">
            Gelir Yönetimi
          </p>

          <h1 className="mt-1 text-3xl font-semibold">
            Satışlar
          </h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat
            title="Toplam Satış"
            value={money(totalSales)}
          />

          <Stat
            title="Nakit"
            value={money(totalCash)}
          />

          <Stat
            title="Kart"
            value={money(totalCard)}
          />

          <Stat
            title="Online"
            value={money(totalOnline)}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <form
            onSubmit={submitSale}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">
              Günlük Satış Ekle
            </h2>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Nakit
                </label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Kart
                </label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={card}
                  onChange={(e) => setCard(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Online
                </label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={online}
                  onChange={(e) => setOnline(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm text-zinc-500">
                  Toplam
                </p>

                <p className="mt-1 text-2xl font-semibold">
                  {money(
                    Number(cash || 0) +
                      Number(card || 0) +
                      Number(online || 0)
                  )}
                </p>
              </div>

              <button
                disabled={loading}
                className="w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
              >
                {loading
                  ? "Kaydediliyor..."
                  : "Satış Kaydet"}
              </button>

              {message && (
                <p className="text-sm text-zinc-400">
                  {message}
                </p>
              )}
            </div>
          </form>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 xl:col-span-2">
            <div className="border-b border-zinc-800 p-6">
              <h2 className="text-xl font-semibold">
                Satış Hareketleri
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-zinc-500">
                  <tr>
                    <th className="px-6 py-4">Tarih</th>
                    <th className="px-6 py-4">Nakit</th>
                    <th className="px-6 py-4">Kart</th>
                    <th className="px-6 py-4">Online</th>
                    <th className="px-6 py-4">Kaynak</th>
                    <th className="px-6 py-4 text-right">
                      Toplam
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b border-zinc-800 last:border-0"
                    >
                      <td className="px-6 py-5">
                        {new Date(
                          sale.date
                        ).toLocaleDateString("tr-TR")}
                      </td>

                      <td className="px-6 py-5">
                        {money(sale.cash)}
                      </td>

                      <td className="px-6 py-5">
                        {money(sale.card)}
                      </td>

                      <td className="px-6 py-5">
                        {money(sale.online)}
                      </td>

                      <td className="px-6 py-5 text-zinc-400">
                        {sale.source ?? "-"}
                      </td>

                      <td className="px-6 py-5 text-right font-medium">
                        {money(sale.total)}
                      </td>
                    </tr>
                  ))}

                  {sales.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-10 text-center text-zinc-500"
                      >
                        Henüz satış kaydı yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-500">
        {title}
      </p>

      <p className="mt-3 text-2xl font-semibold">
        {value}
      </p>
    </div>
  );
}
