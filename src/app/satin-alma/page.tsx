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
import { money, dateLabel, today, sumMoney } from "@/lib/finance";

type Purchase = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  paymentType: string | null;
};
type Supplier = { id: string; name: string };

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("BANK");
  const [search, setSearch] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        fetch("/api/expenses", { cache: "no-store" }),
        fetch("/api/suppliers", { cache: "no-store" }),
      ])
        .then(async ([expenseResponse, supplierResponse]) => {
          const expenses: { success: boolean; expenses: Purchase[] } =
            await expenseResponse.json();
          const supplierResult: { success: boolean; records: Supplier[] } =
            await supplierResponse.json();
          if (
            !expenseResponse.ok ||
            !supplierResponse.ok ||
            !expenses.success ||
            !supplierResult.success
          )
            throw new Error();
          setError("");
          setPurchases(
            expenses.expenses.filter(
              (expense) => expense.category === "Hammadde",
            ),
          );
          setSuppliers(supplierResult.records);
        })
        .catch(() =>
          setError("Satın alma kayıtları veya tedarikçiler yüklenemedi."),
        )
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setMessage("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Pozitif bir EUR tutarı girin.");
      return;
    }
    setSaving(true);
    try {
      const supplier = suppliers.find((item) => item.id === supplierId);
      const details = [
        "Satın Alma",
        supplier?.name,
        reference.trim() ? `Belge: ${reference.trim()}` : "",
        description.trim(),
      ]
        .filter(Boolean)
        .join(" · ");
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          category: "Hammadde",
          description: details,
          amount: value,
          paymentType,
        }),
      });
      const result: { success: boolean } = await response.json();
      if (!response.ok || !result.success) throw new Error();
      setAmount("");
      setDescription("");
      setReference("");
      setMessage("Malzeme alımı Hammadde gideri olarak kaydedildi.");
      await refresh();
    } catch {
      setMessage(
        "Kayıt kaydedilemedi. Tekrar göndermeden önce listeyi yenileyin.",
      );
    } finally {
      setSaving(false);
    }
  }

  const visible = purchases.filter(
    (item) =>
      (!month || item.date.slice(0, 7) === month) &&
      (!search ||
        (item.description ?? "")
          .toLocaleLowerCase("tr-TR")
          .includes(search.toLocaleLowerCase("tr-TR"))),
  );
  const total = sumMoney(visible.map((item) => item.amount));
  const paymentLabels: Record<string, string> = {
    BANK: "Banka",
    CASH: "Nakit",
    CARD: "Kart",
  };

  return (
    <FinancePage
      title="Satın Alma"
      description="Malzeme alımlarını Hammadde giderleri üzerinden takip edin. Her alım Giderler ve Dashboard'da aynı tek kayıt olarak görünür. Stok veya tedarikçi borcu hesabı tutulmaz; bu kayıt hesap bakiyesini değiştirmez."
    >
      <Notice error={error} />
      <div className="mb-6">
        <Stat
          label="Filtrelenen Malzeme Alımları"
          value={loading || error ? "—" : money(total)}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={submit} className={panelClass}>
          <h2 className="mb-5 text-xl font-semibold">Malzeme Alımı Ekle</h2>
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
            <Field label="Tedarikçi">
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                className={inputClass}
              >
                <option value="">Belirtilmedi</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Belge / Fatura Numarası">
              <input
                value={reference}
                maxLength={100}
                onChange={(event) => setReference(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Malzeme / Açıklama">
              <input
                value={description}
                required
                maxLength={300}
                onChange={(event) => setDescription(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Tutar (EUR)">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                required
                onChange={(event) => setAmount(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Ödeme Tipi">
              <select
                value={paymentType}
                onChange={(event) => setPaymentType(event.target.value)}
                className={inputClass}
              >
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <button className={buttonClass} disabled={saving || loading}>
              {saving ? "Kaydediliyor..." : "Alımı Kaydet"}
            </button>
            <Notice message={message} />
          </div>
        </form>
        <div className={`${panelClass} xl:col-span-2`}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Malzeme Alımları</h2>
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className={buttonClass}
            >
              {loading ? "Yükleniyor..." : "Yenile"}
            </button>
          </div>
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <Field label="Dönem">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Tedarikçi / Belge / Açıklama ara">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Tarih", "Alım Açıklaması", "Ödeme", "Tutar"].map(
                    (label) => (
                      <th key={label} className="px-3 py-4">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  !error &&
                  visible.map((purchase) => (
                    <tr key={purchase.id} className="border-t border-zinc-800">
                      <td className="px-3 py-4">{dateLabel(purchase.date)}</td>
                      <td className="px-3 py-4">
                        {purchase.description ?? "—"}
                      </td>
                      <td className="px-3 py-4">
                        {paymentLabels[purchase.paymentType ?? ""] ?? "—"}
                      </td>
                      <td className="px-3 py-4">{money(purchase.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(loading || error || !visible.length) && (
              <p role="status" className="py-6 text-zinc-500">
                {loading
                  ? "Alımlar yükleniyor..."
                  : error
                    ? "Alımlar gösterilemiyor."
                    : "Seçili filtrelerde malzeme alımı yok."}
              </p>
            )}
          </div>
        </div>
      </div>
    </FinancePage>
  );
}
