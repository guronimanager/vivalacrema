"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { StatementWorkspace } from "@/components/statements/workspace";

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
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [filterAccount, setFilterAccount] = useState("");

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);

  // Yeni hesap formu
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [balance, setBalance] = useState("");
  const [accountType, setAccountType] = useState<"BANK" | "CASH" | "SUMUP">(
    "BANK",
  );

  // Hareket formu
  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [transactionType, setTransactionType] = useState<"INCOME" | "EXPENSE">(
    "INCOME",
  );
  const [transactionDate, setTransactionDate] = useState(today());
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionDescription, setTransactionDescription] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");

  const [accountLoading, setAccountLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const [accountMessage, setAccountMessage] = useState("");
  const [transactionMessage, setTransactionMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const refreshAll = useCallback(
    () =>
      Promise.all([
        fetch("/api/bank-accounts", { cache: "no-store" }),
        fetch("/api/bank-transactions", { cache: "no-store" }),
      ])
        .then(async ([accountsResponse, transactionsResponse]) => {
          const accountResult: { success: boolean; accounts: BankAccount[] } =
            await accountsResponse.json();
          const transactionResult: {
            success: boolean;
            transactions: BankTransaction[];
          } = await transactionsResponse.json();
          if (
            !accountsResponse.ok ||
            !transactionsResponse.ok ||
            !accountResult.success ||
            !transactionResult.success
          )
            throw new Error();
          setLoadError("");
          setAccounts(accountResult.accounts);
          setTransactions(transactionResult.transactions);
          setTransactionAccountId(
            (current) => current || accountResult.accounts[0]?.id || "",
          );
        })
        .catch(() =>
          setLoadError("Hesaplar ve hareketler yüklenemedi. Yeniden deneyin."),
        )
        .finally(() => setDataLoading(false)),
    [],
  );

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function refresh() {
    setDataLoading(true);
    setLoadError("");
    await refreshAll();
  }

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

      if (!response.ok || !result.success) {
        setAccountMessage(result.message ?? "Hesap eklenemedi.");
        return;
      }

      setName("");
      setBankName("");
      setIban("");
      setBalance("");
      setAccountType("BANK");
      setAccountMessage("Hesap başarıyla kaydedildi.");

      await refresh();
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

      if (!response.ok || !result.success) {
        setTransactionMessage(result.message ?? "Banka hareketi eklenemedi.");
        return;
      }

      setTransactionCategory("");
      setTransactionDescription("");
      setTransactionAmount("");
      setTransactionMessage("Banka hareketi başarıyla kaydedildi.");

      await refresh();
    } catch {
      setTransactionMessage("Sunucu bağlantı hatası.");
    } finally {
      setTransactionLoading(false);
    }
  }

  async function syncSumUp() {
    setSyncLoading(true);
    setSyncMessage("");

    try {
      const response = await fetch("/api/integrations/sumup/sync", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setSyncMessage(result.message ?? "SumUp senkronizasyonu başarısız.");
        return;
      }

      setSyncMessage(
        `SumUp: ${result.imported} yeni payout aktarıldı, ${result.skipped} kayıt zaten mevcuttu.`,
      );

      await refresh();
    } catch {
      setSyncMessage("SumUp bağlantı hatası.");
    } finally {
      setSyncLoading(false);
    }
  }

  const cashBalance = accounts
    .filter((account) => account.type === "CASH")
    .reduce((sum, account) => sum + account.balance, 0);

  const bankBalance = accounts
    .filter((account) => account.type === "BANK")
    .reduce((sum, account) => sum + account.balance, 0);

  const sumupBalance = accounts
    .filter((account) => account.type === "SUMUP")
    .reduce((sum, account) => sum + account.balance, 0);

  const periodTransactions = transactions.filter(
    (transaction) => !month || transaction.date.slice(0, 7) === month,
  );
  const visibleTransactions = periodTransactions.filter(
    (transaction) =>
      !filterAccount || transaction.bankAccount?.id === filterAccount,
  );
  const totalLiquidity = bankBalance + cashBalance + sumupBalance;

  const sumupFees = periodTransactions
    .filter(
      (transaction) =>
        transaction.type === "EXPENSE" &&
        transaction.source === "sumup" &&
        transaction.category === "SumUp Komisyonu",
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />

      <section className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">Finans Yönetimi</p>

          <h1 className="mt-1 text-3xl font-semibold">Banka & Kasa</h1>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-900 p-4 text-red-400"
          >
            {loadError}
          </div>
        )}
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <label className="text-sm text-zinc-400">
            Hareket dönemi
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-2 block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2"
            />
          </label>
          <label className="text-sm text-zinc-400">
            Hesap
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="mt-2 block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2"
            >
              <option value="">Tüm hesaplar</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={dataLoading}
            className="rounded-xl border border-zinc-700 px-4 py-2 disabled:opacity-50"
          >
            {dataLoading ? "Yükleniyor..." : "Yenile"}
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Bakiyeler güncel hesap bakiyeleridir. Dönem filtresi hareketleri ve
          SumUp komisyonunu etkiler; payout bir transferdir.
        </p>

        <StatementWorkspace accounts={accounts} onSaved={refreshAll} />

        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-zinc-500">SumUp Entegrasyonu</p>

              <p className="mt-1 text-sm text-zinc-300">
                Payout ve komisyon hareketlerini Banka &amp; Kasa’ya aktar.
              </p>

              {syncMessage && (
                <p className="mt-2 text-sm text-zinc-400">{syncMessage}</p>
              )}
            </div>

            <button
              type="button"
              onClick={syncSumUp}
              disabled={syncLoading || dataLoading}
              className="rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
            >
              {syncLoading ? "Senkronize ediliyor..." : "SumUp Senkronize Et"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Toplam Likidite"
            value={dataLoading || loadError ? "—" : money(totalLiquidity)}
          />
          <StatCard
            title="Nakit Kasa"
            value={dataLoading || loadError ? "—" : money(cashBalance)}
          />

          <StatCard
            title="Banka Bakiyesi"
            value={dataLoading || loadError ? "—" : money(bankBalance)}
          />

          <StatCard
            title="SumUp Bakiyesi"
            value={dataLoading || loadError ? "—" : money(sumupBalance)}
          />

          <StatCard
            title="Dönem SumUp Komisyonu"
            value={dataLoading || loadError ? "—" : money(sumupFees)}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <form
            onSubmit={submitAccount}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">Yeni Hesap</h2>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="banka-kasa-field-1"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Hesap Tipi
                </label>

                <select
                  id="banka-kasa-field-1"
                  value={accountType}
                  onChange={(e) =>
                    setAccountType(e.target.value as "BANK" | "CASH" | "SUMUP")
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                >
                  <option value="BANK">Banka</option>
                  <option value="CASH">Kasa</option>
                  <option value="SUMUP">SumUp</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="banka-kasa-field-2"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Hesap Adı
                </label>

                <input
                  id="banka-kasa-field-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Ana Hesap"
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="banka-kasa-field-3"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Banka Adı
                </label>

                <input
                  id="banka-kasa-field-3"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Örn: Sparkasse"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="banka-kasa-field-4"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  IBAN
                </label>

                <input
                  id="banka-kasa-field-4"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="DE..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="banka-kasa-field-5"
                  className="mb-2 block text-sm text-zinc-400"
                >
                  Başlangıç Bakiyesi
                </label>

                <input
                  id="banka-kasa-field-5"
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
              disabled={accountLoading || dataLoading}
              className="mt-6 w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
            >
              {accountLoading ? "Kaydediliyor..." : "Hesap Kaydet"}
            </button>

            {accountMessage && (
              <p className="mt-4 text-sm text-zinc-400">{accountMessage}</p>
            )}
          </form>

          <form
            onSubmit={submitTransaction}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="mb-6 text-xl font-semibold">Yeni Para Hareketi</h2>

            {accounts.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Para hareketi eklemek için önce bir banka veya kasa hesabı
                oluştur.
              </p>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="banka-kasa-field-6"
                      className="mb-2 block text-sm text-zinc-400"
                    >
                      Hesap
                    </label>

                    <select
                      id="banka-kasa-field-6"
                      value={transactionAccountId}
                      onChange={(e) => setTransactionAccountId(e.target.value)}
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
                    <label
                      htmlFor="banka-kasa-field-7"
                      className="mb-2 block text-sm text-zinc-400"
                    >
                      İşlem Tipi
                    </label>

                    <select
                      id="banka-kasa-field-7"
                      value={transactionType}
                      onChange={(e) =>
                        setTransactionType(
                          e.target.value as "INCOME" | "EXPENSE",
                        )
                      }
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    >
                      <option value="INCOME">Para Girişi</option>
                      <option value="EXPENSE">Para Çıkışı</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="banka-kasa-field-8"
                      className="mb-2 block text-sm text-zinc-400"
                    >
                      Tarih
                    </label>

                    <input
                      id="banka-kasa-field-8"
                      type="date"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      required
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="banka-kasa-field-9"
                      className="mb-2 block text-sm text-zinc-400"
                    >
                      Tutar
                    </label>

                    <input
                      id="banka-kasa-field-9"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="banka-kasa-field-10"
                      className="mb-2 block text-sm text-zinc-400"
                    >
                      Kategori
                    </label>

                    <input
                      id="banka-kasa-field-10"
                      value={transactionCategory}
                      onChange={(e) => setTransactionCategory(e.target.value)}
                      placeholder="Örn: Sermaye, Fatura, Tedarikçi"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="banka-kasa-field-11"
                      className="mb-2 block text-sm text-zinc-400"
                    >
                      Açıklama
                    </label>

                    <input
                      id="banka-kasa-field-11"
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
                  disabled={transactionLoading || dataLoading || !!loadError}
                  className="mt-6 w-full rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50"
                >
                  {transactionLoading ? "Kaydediliyor..." : "Hareket Kaydet"}
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
            <h2 className="text-xl font-semibold">Hesaplar</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Tip</th>
                  <th className="px-6 py-4">Hesap</th>
                  <th className="px-6 py-4">Banka</th>
                  <th className="px-6 py-4">IBAN</th>
                  <th className="px-6 py-4 text-right">Bakiye</th>
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

                    <td className="px-6 py-5 font-medium">{account.name}</td>

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
                      {dataLoading
                        ? "Hesaplar yükleniyor..."
                        : loadError
                          ? "Hesaplar gösterilemiyor."
                          : "Henüz hesap yok."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-6">
            <h2 className="text-xl font-semibold">Son Hareketler</h2>
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
                {visibleTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-b border-zinc-800 last:border-0"
                  >
                    <td className="px-6 py-5">
                      {new Date(transaction.date).toLocaleDateString("tr-TR")}
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
                      {transaction.type === "EXPENSE"
                        ? "-"
                        : transaction.type === "INCOME"
                          ? "+"
                          : ""}
                      {money(transaction.amount)}
                    </td>
                  </tr>
                ))}

                {visibleTransactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-zinc-500"
                    >
                      {dataLoading
                        ? "Hareketler yükleniyor..."
                        : loadError
                          ? "Hareketler gösterilemiyor."
                          : "Seçili filtrelerde hareket yok."}
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

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-500">{title}</p>

      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}
