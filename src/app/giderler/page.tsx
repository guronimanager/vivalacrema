"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  paymentType: string | null;
  source?: "sumup";
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
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [month, setMonth] = useState(
    new Date().toLocaleDateString("en-CA").slice(0, 7),
  );
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState("Hammadde");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [paymentType, setPaymentType] = useState("BANK");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadExpenses = useCallback(
    () =>
      Promise.all([
        fetch("/api/expenses", { cache: "no-store" }),
        fetch("/api/bank-transactions", { cache: "no-store" }),
      ])
        .then(async ([expenseResponse, transactionResponse]) => {
          const result: { success: boolean; expenses: Expense[] } =
            await expenseResponse.json();
          const transactions: {
            success: boolean;
            transactions: {
              id: string;
              date: string;
              type: string;
              source: string | null;
              category: string | null;
              description: string | null;
              amount: number;
            }[];
          } = await transactionResponse.json();
          if (
            !expenseResponse.ok ||
            !transactionResponse.ok ||
            !result.success ||
            !transactions.success
          )
            throw new Error();
          const fees: Expense[] = transactions.transactions
            .filter(
              (item) =>
                item.type === "EXPENSE" &&
                item.source === "sumup" &&
                item.category === "SumUp Komisyonu",
            )
            .map((item) => ({
              id: `sumup:${item.id}`,
              date: item.date,
              category: "SumUp Komisyonu",
              description: item.description,
              amount: item.amount,
              paymentType: null,
              source: "sumup",
            }));
          setLoadError("");
          setExpenses(
            [...result.expenses, ...fees].sort((a, b) =>
              b.date.localeCompare(a.date),
            ),
          );
        })
        .catch(() => setLoadError("Giderler yüklenemedi. Yeniden deneyin."))
        .finally(() => setDataLoading(false)),
    [],
  );

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  async function refresh() {
    setDataLoading(true);
    setLoadError("");
    await loadExpenses();
  }

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
          date,
          category,
          description,
          amount: Number(amount),
          paymentType,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setMessage(result.message ?? "Gider eklenemedi.");
        return;
      }

      setDescription("");
      setAmount("");
      setMessage("Gider başarıyla kaydedildi.");

      await refresh();
    } catch {
      setMessage("Sunucu bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  const visibleExpenses = expenses.filter(
    (expense) =>
      (!month || expense.date.slice(0, 7) === month) &&
      (!filterCategory || expense.category === filterCategory) &&
      (!search ||
        `${expense.category} ${expense.description ?? ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(search.toLocaleLowerCase("tr-TR"))),
  );
  const total = visibleExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const feeTotal = visibleExpenses
    .filter((expense) => expense.source === "sumup")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const filterCategories = [
    ...new Set(expenses.map((expense) => expense.category)),
  ].sort((a, b) => a.localeCompare(b, "tr"));
  const categoryTotals = Object.entries(
    visibleExpenses.reduce<Record<string, number>>((totals, expense) => {
      totals[expense.category] =
        (totals[expense.category] ?? 0) + expense.amount;
      return totals;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const paymentLabels: Record<string, string> = {
    BANK: "Banka",
    CASH: "Nakit",
    CARD: "Kart",
  };

  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />

      <section className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">Finans Yönetimi</p>
          <h1 className="mt-1 text-3xl font-semibold">Giderler</h1>
        </div>

        {loadError && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-900 p-4 text-red-400"
          >
            {loadError}
          </p>
        )}
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <label className="text-sm text-zinc-400">
            Dönem
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-2 block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2"
            />
          </label>
          <label className="text-sm text-zinc-400">
            Kategori
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="mt-2 block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2"
            >
              <option value="">Tüm kategoriler</option>
              {filterCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Ara
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kategori veya açıklama"
              className="mt-2 block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2"
            />
          </label>
          <button
            type="button"
            disabled={dataLoading}
            onClick={() => void refresh()}
            className="rounded-xl border border-zinc-700 px-4 py-2 disabled:opacity-50"
          >
            {dataLoading ? "Yükleniyor..." : "Yenile"}
          </button>
        </div>
        <p className="mb-6 text-sm text-zinc-500">
          SumUp komisyonları otomatik hareketlerden gösterilir. Manuel giderleri
          burada bir kez kaydedin. Gider kaydı hesap bakiyesini değiştirmez.
        </p>

        <div className="grid gap-6 xl:grid-cols-3">
          <form
            onSubmit={submitExpense}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">Yeni Gider</h2>

            <div className="space-y-5">
              <div>
                <label
                  htmlFor="giderler-field-1"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Tarih
                </label>

                <input
                  id="giderler-field-1"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="giderler-field-2"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Kategori
                </label>

                <select
                  id="giderler-field-2"
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
                <label
                  htmlFor="giderler-field-3"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Açıklama
                </label>

                <input
                  id="giderler-field-3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Örn: Elektrik faturası"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="giderler-field-4"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Tutar
                </label>

                <input
                  id="giderler-field-4"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="giderler-field-5"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Ödeme Tipi
                </label>

                <select
                  id="giderler-field-5"
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
                disabled={loading || dataLoading}
                className="w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
              >
                {loading ? "Kaydediliyor..." : "Gider Kaydet"}
              </button>

              {message && <p className="text-sm text-zinc-400">{message}</p>}
            </div>
          </form>

          <div className="xl:col-span-2">
            <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <p className="text-sm text-zinc-500">Filtrelenen Toplam Gider</p>

              <p className="mt-2 text-3xl font-semibold">
                {dataLoading || loadError ? "—" : money(total)}
              </p>
            </div>

            <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="mb-4 text-xl font-semibold">Gider Dağılımı</h2>
              <p className="mb-4 text-sm text-zinc-400">
                SumUp komisyonu:{" "}
                {dataLoading || loadError ? "—" : money(feeTotal)}
              </p>
              {!dataLoading &&
                !loadError &&
                categoryTotals.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between border-b border-zinc-800 py-3 last:border-0"
                  >
                    <span>{label}</span>
                    <span>{money(value)}</span>
                  </div>
                ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 p-6">
                <h2 className="text-xl font-semibold">Gider Hareketleri</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-800 text-zinc-500">
                    <tr>
                      <th className="px-6 py-4">Tarih</th>
                      <th className="px-6 py-4">Kategori</th>
                      <th className="px-6 py-4">Açıklama</th>
                      <th className="px-6 py-4">Ödeme</th>
                      <th className="px-6 py-4 text-right">Tutar</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleExpenses.map((expense) => (
                      <tr
                        key={expense.id}
                        className="border-b border-zinc-800 last:border-0"
                      >
                        <td className="px-6 py-5">
                          {new Date(expense.date).toLocaleDateString("tr-TR")}
                        </td>

                        <td className="px-6 py-5">{expense.category}</td>

                        <td className="px-6 py-5 text-zinc-400">
                          {expense.description ?? "-"}
                        </td>

                        <td className="px-6 py-5 text-zinc-400">
                          {expense.source === "sumup"
                            ? "SumUp (otomatik)"
                            : (paymentLabels[expense.paymentType ?? ""] ?? "—")}
                        </td>

                        <td className="px-6 py-5 text-right font-medium">
                          {money(expense.amount)}
                        </td>
                      </tr>
                    ))}

                    {visibleExpenses.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-10 text-center text-zinc-500"
                        >
                          {dataLoading
                            ? "Giderler yükleniyor..."
                            : loadError
                              ? "Giderler gösterilemiyor."
                              : "Seçili filtrelerde gider kaydı yok."}
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
