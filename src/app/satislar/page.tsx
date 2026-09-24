import { Sidebar } from "@/components/layout/sidebar";

const sales = [
  {
    date: "24.09.2026",
    cash: 6200,
    card: 21450,
    online: 5300,
    total: 32950,
  },
  {
    date: "23.09.2026",
    cash: 5800,
    card: 19800,
    online: 4100,
    total: 29700,
  },
  {
    date: "22.09.2026",
    cash: 4900,
    card: 18250,
    online: 4700,
    total: 27850,
  },
];

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SalesPage() {
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cash = sales.reduce((sum, sale) => sum + sale.cash, 0);
  const card = sales.reduce((sum, sale) => sum + sale.card, 0);
  const online = sales.reduce((sum, sale) => sum + sale.online, 0);

  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500">Gelir Yönetimi</p>
            <h1 className="mt-1 text-3xl font-semibold">Satışlar</h1>
          </div>

          <button className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black">
            + Günlük Satış Ekle
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Toplam Satış" value={money(total)} />
          <Stat title="Nakit" value={money(cash)} />
          <Stat title="Kredi Kartı" value={money(card)} />
          <Stat title="Online" value={money(online)} />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-6">
            <h2 className="text-lg font-semibold">Günlük Satışlar</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-zinc-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Tarih</th>
                  <th className="px-6 py-4 font-medium">Nakit</th>
                  <th className="px-6 py-4 font-medium">Kart</th>
                  <th className="px-6 py-4 font-medium">Online</th>
                  <th className="px-6 py-4 font-medium">Toplam</th>
                </tr>
              </thead>

              <tbody>
                {sales.map((sale) => (
                  <tr
                    key={sale.date}
                    className="border-b border-zinc-800 last:border-none"
                  >
                    <td className="px-6 py-5">{sale.date}</td>
                    <td className="px-6 py-5 text-zinc-300">
                      {money(sale.cash)}
                    </td>
                    <td className="px-6 py-5 text-zinc-300">
                      {money(sale.card)}
                    </td>
                    <td className="px-6 py-5 text-zinc-300">
                      {money(sale.online)}
                    </td>
                    <td className="px-6 py-5 font-semibold">
                      {money(sale.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}
