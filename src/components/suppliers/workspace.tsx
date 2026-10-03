"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FinancePage,
  Field,
  Notice,
  inputClass,
  buttonClass,
  panelClass,
} from "@/components/finance/ui";
import { PeriodFilter } from "@/components/period/filter";
import { queryPeriod, type Period } from "@/lib/period";
import { InvoiceIntake, type IntakeResult } from "@/components/catalog/intake";
import type { InvoiceOcr } from "@/lib/invoices/ocr";
import { clientApi } from "@/lib/client-api";
import { money } from "@/lib/finance";
interface Supplier {
  id: string;
  name: string;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  purchaseTotal: number;
  outstanding: number;
  periodOutstanding: number;
  productCount: number;
  documents: { documentId: string }[];
}
const blank = () => ({
  id: "",
  name: "",
  taxNumber: "",
  email: "",
  phone: "",
  documentId: "",
  documentDate: "",
});
export function SuppliersWorkspace() {
  const [period, setPeriod] = useState(() =>
      queryPeriod(new URLSearchParams()),
    ),
    [records, setRecords] = useState<Supplier[]>([]),
    [draft, setDraft] = useState(blank),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    clientApi<{ records: Supplier[] }>(
      `/api/suppliers/summary?start=${period.start}&end=${period.end}`,
    )
      .then((d) => {
        if (!controller.signal.aborted) {
          setRecords(d.records);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [period, version]);
  function read(data: IntakeResult) {
    const r = data.result as InvoiceOcr;
    setDraft({
      ...blank(),
      name: r.supplierName || "",
      taxNumber: r.taxNumber || "",
      documentId: data.documentId,
      documentDate: r.date || "",
    });
    setMessage(
      "OCR alanlarını kontrol edin. Bu kayıt tek başına borç veya gider oluşturmaz; faturayı Satın Alma bölümünde kaydedin.",
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const data = await clientApi<{ syncStatus?: string }>(
        "/api/suppliers",
        draft,
        draft.id ? "PATCH" : "POST",
      );
      setMessage(
        `Tedarikçi kaydedildi.${draft.documentId ? (data.syncStatus === "SYNCED" ? " OneDrive arşivi tamamlandı." : " Arşiv aktarımını Evrak Arşivi’nden kontrol edin.") : ""}`,
      );
      setDraft(blank());
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FinancePage
      title="Tedarikçiler"
      description="Tedarikçi kayıtları, dönem alışları ve ödeme takibi."
    >
      <PeriodFilter
        initial={period}
        onChange={(p: Period) => {
          setRecords([]);
          setPeriod(p);
        }}
      />
      <p className="mb-4 text-sm text-zinc-400">
        {period.label} · Açık borç, dönem sonuna kadar kaydedilen faturalar ve
        ödemelerden hesaplanır.
      </p>
      <Notice error={error} message={message} />
      <InvoiceIntake onRead={read} />
      <form
        className={panelClass}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="mb-4 text-xl">
          {draft.id ? "Tedarikçiyi düzenle" : "Tedarikçi ekle"}
        </h2>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          {[
            ["name", "Tedarikçi adı"],
            ["taxNumber", "Vergi numarası"],
            ["email", "E-posta"],
            ["phone", "Telefon (+49…)"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={inputClass}
                required={key === "name"}
                type={key === "email" ? "email" : "text"}
                value={draft[key as "name"]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </Field>
          ))}
          {draft.documentId ? (
            <Field label="Fatura tarihi / Arşiv ayı">
              <input
                className={inputClass}
                type="date"
                required
                value={draft.documentDate}
                onChange={(e) =>
                  setDraft({ ...draft, documentDate: e.target.value })
                }
              />
            </Field>
          ) : null}
        </fieldset>
        <button disabled={busy} className={`${buttonClass} mt-4`}>
          Kaydet
        </button>
        <button
          type="button"
          className="ml-4 underline"
          onClick={() => setDraft(blank())}
        >
          Formu temizle
        </button>
      </form>
      <section className={`${panelClass} mt-6 overflow-auto`}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Tedarikçi",
                "Dönem satın alma",
                "Dönem faturalarından açık",
                "Dönem sonu toplam açık",
                "Ürün / Evrak",
                "İşlem",
              ].map((x) => (
                <th className="p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((s) => (
              <tr key={s.id} className="border-t border-zinc-700">
                <td className="p-3">
                  {s.name}
                  <p>{s.email}</p>
                  <p>{s.phone}</p>
                </td>
                <td className="p-3">{money(s.purchaseTotal)}</td>
                <td className="p-3">{money(s.periodOutstanding)}</td>
                <td className="p-3">{money(s.outstanding)}</td>
                <td className="p-3">
                  <Link className="underline" href="/urunler">
                    {s.productCount} ürün
                  </Link>
                  {s.documents.map((d, i) => (
                    <p key={d.documentId}>
                      <a
                        className="underline"
                        href={`/api/documents/download?id=${d.documentId}`}
                      >
                        Evrak {i + 1}
                      </a>
                    </p>
                  ))}
                </td>
                <td className="p-3">
                  <button
                    className="underline"
                    onClick={() =>
                      setDraft({
                        ...blank(),
                        id: s.id,
                        name: s.name,
                        email: s.email || "",
                        phone: s.phone || "",
                        taxNumber: s.taxNumber || "",
                      })
                    }
                  >
                    Düzenle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length ? (
          <p className="mt-4">Tedarikçi kaydı yok veya bağlantı bekleniyor.</p>
        ) : null}
      </section>
    </FinancePage>
  );
}
