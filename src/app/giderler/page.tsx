"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  paymentType: string | null;
};

const categories = [
  "Hammadde",
  "Personel",
  "Kira",
  "Elektrik",
  "Su",
  "Doğalgaz",
  "İnternet",
  "Vergi",
  "Muhasebe",
  "Temizlik",
  "Bakım",
  "Diğer",
];

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState("Hammadde");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("BANK");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadExpenses() {
    const response = await fetch("/api/expenses", {
      cache: "no-store",
    });

    const result = await response.json();

    if (result.success) {
      setExpenses(result.expenses);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          description,
          amount: Number(amount),
          paymentType,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.message ?? "Gider eklenemedi.");
        return;
      }

      setDescription("");
      setAmount("");
      setMessage("Gider başarıyla kaydedildi.");

      await loadExpenses();
    } catch {
      setMessage("Sunucu bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  const total = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">Finans Yönetimi</p>
          <h1 className="mt-1 text-3xl font-semibold">Giderler</h1>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <form
            onSubmit={submitExpense}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">
              Yeni Gider
            </h2>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Kategori
                </label>

                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                >
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Açıklama
                </label>

                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Örn: Eylül elektrik faturası"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Tutar
                </label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Ödeme Tipi
                </label>

                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                >
                  <option value="BANK">Banka</option>
                  <option value="CASH">Nakit</option>
                  <option value="CARD">Kart</option>
                </select>
              </div>

              <button
                disabled={loading}
                className="w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
              >
                {loading ? "Kaydediliyor..." : "Gider Kaydet"}
              </button>

              {message && (
                <p className="text-sm text-zinc-400">
                  {message}
                </p>
              )}
            </div>
          </form>

          <div className="xl:col-span-2">
            <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <p className="text-sm text-zinc-500">
                Toplam Kayıtlı Gider
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {money(total)}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 p-6">
                <h2 className="text-xl font-semibold">
                  Gider Hareketleri
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-800 text-zinc-500">
                    <tr>
                      <th className="px-6 py-4">Tarih</th>
                      <th className="px-6 py-4">Kategori</th>
                      <th className="px-6 py-4">Açıklama</th>
                      <th className="px-6 py-4">Ödeme</th>
                      <th className="px-6 py-4 text-right">
                        Tutar
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {expenses.map((expense) => (
                      <tr
                        key={expense.id}
                        className="border-b border-zinc-800 last:border-0"
                      >
                        <td className="px-6 py-5">
                          {new Date(expense.date).toLocaleDateString(
                            "tr-TR"
                          )}
                        </td>

                        <td className="px-6 py-5">
                          {expense.category}
                        </td>

                        <td className="px-6 py-5 text-zinc-400">
                          {expense.description ?? "-"}
                        </td>

                        <td className="px-6 py-5 text-zinc-400">
                          {expense.paymentType ?? "-"}
                        </td>

                        <td className="px-6 py-5 text-right font-medium">
                          {money(expense.amount)}
                        </td>
                      </tr>
                    ))}

                    {expenses.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-10 text-center text-zinc-500"
                        >
                          Henüz gider kaydı yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
