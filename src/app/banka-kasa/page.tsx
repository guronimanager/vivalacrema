"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";

type BankAccount = {
  id: string;
  name: string;
  bankName: string | null;
  iban: string | null;
  balance: number;
  type: "BANK" | "CASH" | "SUMUP";
};

type BankTransaction = {
  id: string;
  date: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  category: string | null;
  description: string | null;
  amount: number;
  source: string | null;
  bankAccount: BankAccount | null;
};

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function today() {
  return new Date().toLocaleDateString("en-CA");
}

export default function BankCashPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);

  // Yeni hesap formu
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [balance, setBalance] = useState("");
  const [accountType, setAccountType] =
    useState<"BANK" | "CASH" | "SUMUP">("BANK");

  // Hareket formu
  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [transactionType, setTransactionType] =
    useState<"INCOME" | "EXPENSE">("INCOME");
  const [transactionDate, setTransactionDate] = useState(today());
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionDescription, setTransactionDescription] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");

  const [accountLoading, setAccountLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);

  const [accountMessage, setAccountMessage] = useState("");
  const [transactionMessage, setTransactionMessage] = useState("");

  async function loadAccounts() {
    const response = await fetch("/api/bank-accounts", {
      cache: "no-store",
    });

    const result = await response.json();

    if (result.success) {
      setAccounts(result.accounts);

      if (!transactionAccountId && result.accounts.length > 0) {
        setTransactionAccountId(result.accounts[0].id);
      }
    }
  }

  async function loadTransactions() {
    const response = await fetch("/api/bank-transactions", {
      cache: "no-store",
    });

    const result = await response.json();

    if (result.success) {
      setTransactions(result.transactions);
    }
  }

  async function refreshAll() {
    await Promise.all([
      loadAccounts(),
      loadTransactions(),
    ]);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();

    setAccountLoading(true);
    setAccountMessage("");

    try {
      const response = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          bankName,
          iban,
          balance: Number(balance || 0),
          type: accountType,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setAccountMessage(result.message ?? "Hesap eklenemedi.");
        return;
      }

      setName("");
      setBankName("");
      setIban("");
      setBalance("");
      setAccountType("BANK");
      setAccountMessage("Banka hesabı başarıyla kaydedildi.");

      await loadAccounts();
    } catch {
      setAccountMessage("Sunucu bağlantı hatası.");
    } finally {
      setAccountLoading(false);
    }
  }

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();

    setTransactionLoading(true);
    setTransactionMessage("");

    try {
      const response = await fetch("/api/bank-transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bankAccountId: transactionAccountId,
          type: transactionType,
          date: transactionDate,
          category: transactionCategory,
          description: transactionDescription,
          amount: Number(transactionAmount),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setTransactionMessage(
          result.message ?? "Banka hareketi eklenemedi."
        );
        return;
      }

      setTransactionCategory("");
      setTransactionDescription("");
      setTransactionAmount("");
      setTransactionMessage("Banka hareketi başarıyla kaydedildi.");

      await refreshAll();
    } catch {
      setTransactionMessage("Sunucu bağlantı hatası.");
    } finally {
      setTransactionLoading(false);
    }
  }

  const totalBalance = accounts.reduce(
    (sum, account) => sum + account.balance,
    0
  );

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalExpense = transactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">
            Finans Yönetimi
          </p>

          <h1 className="mt-1 text-3xl font-semibold">
            Banka & Kasa
          </h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Toplam Bakiye"
            value={money(totalBalance)}
          />

          <StatCard
            title="Hesap Sayısı"
            value={String(accounts.length)}
          />

          <StatCard
            title="Toplam Giriş"
            value={money(totalIncome)}
          />

          <StatCard
            title="Toplam Çıkış"
            value={money(totalExpense)}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <form
            onSubmit={submitAccount}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">
              Yeni Hesap
            </h2>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Hesap Tipi
                </label>

                <select
                  value={accountType}
                  onChange={(e) =>
                    setAccountType(
                      e.target.value as "BANK" | "CASH" | "SUMUP"
                    )
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                >
                  <option value="BANK">Banka</option>
                  <option value="CASH">Kasa</option>
                  <option value="SUMUP">SumUp</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Hesap Adı
                </label>

                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Ana Hesap"
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Banka Adı
                </label>

                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Örn: Sparkasse"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  IBAN
                </label>

                <input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="DE..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Başlangıç Bakiyesi
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>
            </div>

            <button
              disabled={accountLoading}
              className="mt-6 w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
            >
              {accountLoading ? "Kaydediliyor..." : "Hesap Kaydet"}
            </button>

            {accountMessage && (
              <p className="mt-4 text-sm text-zinc-400">
                {accountMessage}
              </p>
            )}
          </form>

          <form
            onSubmit={submitTransaction}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">
              Yeni Para Hareketi
            </h2>

            {accounts.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Para hareketi eklemek için önce bir banka veya kasa hesabı oluştur.
              </p>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Hesap
                    </label>

                    <select
                      value={transactionAccountId}
                      onChange={(e) =>
                        setTransactionAccountId(e.target.value)
                      }
                      required
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      İşlem Tipi
                    </label>

                    <select
                      value={transactionType}
                      onChange={(e) =>
                        setTransactionType(
                          e.target.value as "INCOME" | "EXPENSE"
                        )
                      }
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    >
                      <option value="INCOME">Para Girişi</option>
                      <option value="EXPENSE">Para Çıkışı</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Tarih
                    </label>

                    <input
                      type="date"
                      value={transactionDate}
                      onChange={(e) =>
                        setTransactionDate(e.target.value)
                      }
                      required
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
                      min="0.01"
                      value={transactionAmount}
                      onChange={(e) =>
                        setTransactionAmount(e.target.value)
                      }
                      placeholder="0.00"
                      required
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Kategori
                    </label>

                    <input
                      value={transactionCategory}
                      onChange={(e) =>
                        setTransactionCategory(e.target.value)
                      }
                      placeholder="Örn: Sermaye, Fatura, Tedarikçi"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Açıklama
                    </label>

                    <input
                      value={transactionDescription}
                      onChange={(e) =>
                        setTransactionDescription(e.target.value)
                      }
                      placeholder="İşlem açıklaması"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    />
                  </div>
                </div>

                <button
                  disabled={transactionLoading}
                  className="mt-6 w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
                >
                  {transactionLoading
                    ? "Kaydediliyor..."
                    : "Hareket Kaydet"}
                </button>

                {transactionMessage && (
                  <p className="mt-4 text-sm text-zinc-400">
                    {transactionMessage}
                  </p>
                )}
              </>
            )}
          </form>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-6">
            <h2 className="text-xl font-semibold">
              Banka Hesapları
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Tip</th>
                  <th className="px-6 py-4">Hesap</th>
                  <th className="px-6 py-4">Banka</th>
                  <th className="px-6 py-4">IBAN</th>
                  <th className="px-6 py-4 text-right">
                    Bakiye
                  </th>
                </tr>
              </thead>

              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-zinc-800 last:border-0"
                  >
                    <td className="px-6 py-5 text-zinc-400">
                      {account.type === "BANK"
                        ? "Banka"
                        : account.type === "CASH"
                          ? "Kasa"
                          : "SumUp"}
                    </td>

                    <td className="px-6 py-5 font-medium">
                      {account.name}
                    </td>

                    <td className="px-6 py-5 text-zinc-400">
                      {account.bankName ?? "-"}
                    </td>

                    <td className="px-6 py-5 text-zinc-400">
                      {account.iban ?? "-"}
                    </td>

                    <td className="px-6 py-5 text-right font-medium">
                      {money(account.balance)}
                    </td>
                  </tr>
                ))}

                {accounts.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-zinc-500"
                    >
                      Henüz banka hesabı yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-6">
            <h2 className="text-xl font-semibold">
              Son Hareketler
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Tarih</th>
                  <th className="px-6 py-4">Hesap</th>
                  <th className="px-6 py-4">Tip</th>
                  <th className="px-6 py-4">Kategori</th>
                  <th className="px-6 py-4">Açıklama</th>
                  <th className="px-6 py-4 text-right">Tutar</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-b border-zinc-800 last:border-0"
                  >
                    <td className="px-6 py-5">
                      {new Date(
                        transaction.date
                      ).toLocaleDateString("tr-TR")}
                    </td>

                    <td className="px-6 py-5">
                      {transaction.bankAccount?.name ?? "-"}
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={
                          transaction.type === "INCOME"
                            ? "text-emerald-400"
                            : transaction.type === "EXPENSE"
                              ? "text-red-400"
                              : "text-zinc-400"
                        }
                      >
                        {transaction.type === "INCOME"
                          ? "Giriş"
                          : transaction.type === "EXPENSE"
                            ? "Çıkış"
                            : "Transfer"}
                      </span>
                    </td>

                    <td className="px-6 py-5 text-zinc-400">
                      {transaction.category ?? "-"}
                    </td>

                    <td className="px-6 py-5 text-zinc-400">
                      {transaction.description ?? "-"}
                    </td>

                    <td
                      className={`px-6 py-5 text-right font-medium ${
                        transaction.type === "INCOME"
                          ? "text-emerald-400"
                          : transaction.type === "EXPENSE"
                            ? "text-red-400"
                            : ""
                      }`}
                    >
                      {transaction.type === "EXPENSE" ? "-" : "+"}
                      {money(transaction.amount)}
                    </td>
                  </tr>
                ))}

                {transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-zinc-500"
                    >
                      Henüz banka hareketi yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
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

      <p className="mt-3 text-3xl font-semibold">
        {value}
      </p>
    </div>
  );
}
