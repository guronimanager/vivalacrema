"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FinancePage,
  Field,
  inputClass,
  buttonClass,
  panelClass,
  Notice,
} from "@/components/finance/ui";
import { clientApi } from "@/lib/client-api";
import { money, today, dateLabel } from "@/lib/finance";
import {
  units,
  type CatalogProduct,
  type CatalogSupplier,
} from "@/lib/catalog/constants";
import { InvoiceWorkspace } from "@/components/invoices/workspace";
interface RequestRecord {
  id: string;
  number: string;
  date: string;
  requiredDate: string | null;
  creatorEmail: string;
  notes: string | null;
  message: string;
  emailStatus: string;
  estimatedNet: string;
  supplier: CatalogSupplier;
  lines: {
    code: string;
    name: string;
    unit: string;
    quantity: number;
    supplierCode: string | null;
  }[];
}
function whatsappNumber(phone: string | null) {
  if (!phone) return "";
  const value = phone.trim();
  if (!value.startsWith("+") && !value.startsWith("00")) return "";
  const number = value.replace(/\D/g, "").replace(/^00/, "");
  return /^\d{8,15}$/.test(number) ? number : "";
}
export function ProcurementWorkspace() {
  const [products, setProducts] = useState<CatalogProduct[]>([]),
    [suppliers, setSuppliers] = useState<CatalogSupplier[]>([]),
    [requests, setRequests] = useState<RequestRecord[]>([]),
    [creatorEmail, setCreatorEmail] = useState(""),
    [supplierId, setSupplierId] = useState(""),
    [date, setDate] = useState(today),
    [requiredDate, setRequiredDate] = useState(""),
    [notes, setNotes] = useState(""),
    [lines, setLines] = useState<{ productId: string; quantity: string }[]>([]),
    [addId, setAddId] = useState(""),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [emailConfirmed, setEmailConfirmed] = useState(false),
    [mailConnected, setMailConnected] = useState(false),
    [tab, setTab] = useState("REQUESTS");
  const requestKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    const [p, s, r, status] = await Promise.all([
      clientApi<{ products: CatalogProduct[] }>("/api/products"),
      clientApi<{ records: CatalogSupplier[] }>("/api/suppliers"),
      clientApi<{ requests: RequestRecord[]; creatorEmail: string }>(
        "/api/purchase-requests",
      ),
      clientApi<{ mailConnected: boolean }>(
        "/api/integrations/onedrive/status",
      ),
    ]);
    setProducts(p.products);
    setSuppliers(s.records);
    setRequests(r.requests);
    setCreatorEmail(r.creatorEmail);
    setMailConnected(status.mailConnected);
    return { products: p.products, suppliers: s.records };
  }, []);
  useEffect(() => {
    // State updates in load happen only after the API response resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .then((data) => {
        const query = new URLSearchParams(window.location.search),
          supplier = query.get("supplier") || "",
          ids = (query.get("products") || "").split(",").filter(Boolean);
        if (supplier) {
          setSupplierId(supplier);
          const valid = data.products.filter(
            (p) =>
              ids.includes(p.id) &&
              p.active &&
              p.suppliers.some((s) => s.supplierId === supplier),
          );
          setLines(valid.map((p) => ({ productId: p.id, quantity: "1" })));
          if (valid.length !== ids.length)
            setError("Bazı ürünler bu tedarikçiye bağlı değil veya pasif.");
        }
      })
      .catch((e) => setError(e.message));
  }, [load]);
  const eligible = products.filter(
    (p) =>
      p.active &&
      p.suppliers.some((s) => s.supplierId === supplierId) &&
      !lines.some((l) => l.productId === p.id),
  );
  const current = requests.find((r) => r.id === selected);
  async function save() {
    setBusy(true);
    setError("");
    try {
      requestKey.current ||= crypto.randomUUID();
      const result = await clientApi<{ request: { id: string } }>(
        "/api/purchase-requests",
        {
          supplierId,
          date,
          requiredDate,
          notes,
          lines,
          requestId: requestKey.current,
        },
      );
      requestKey.current = null;
      await load();
      setSelected(result.request.id);
      setLines([]);
      setNotes("");
      setEmailConfirmed(false);
      setMessage(
        "Talep kaydedildi. PDF’yi indirip e-posta/WhatsApp paylaşımını hazırlayabilirsiniz.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const result = await clientApi<{ message: string }>(
        "/api/purchase-requests/email",
        {
          id: current.id,
          confirmed: emailConfirmed,
          expectedRecipient: current.supplier.email,
        },
      );
      setMessage(result.message);
      setEmailConfirmed(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function sharePdf() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/purchase-requests/pdf?id=${current.id}`,
      );
      if (!response.ok) throw new Error("PDF alınamadı.");
      const file = new File([await response.blob()], `${current.number}.pdf`, {
        type: "application/pdf",
      });
      if (!navigator.canShare?.({ files: [file] }))
        throw new Error(
          "Bu tarayıcı PDF paylaşımını desteklemiyor. PDF’yi indirip WhatsApp’a ekleyin.",
        );
      await navigator.share({
        files: [file],
        title: current.number,
        text: `Viva La Crema · ${current.number}`,
      });
      setMessage(
        "Paylaşım ekranı kapandı; gönderimi seçtiğiniz uygulamada kontrol edin.",
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const statuses: Record<string, string> = {
    NOT_SENT: "Henüz gönderilmedi",
    SENDING: "Gönderim sonucu bekleniyor",
    ACCEPTED: "Microsoft gönderimi kabul etti",
    UNKNOWN: "Sonuç belirsiz: Gönderilmiş Öğeler’i kontrol edin",
    FAILED: "Gönderim reddedildi",
  };
  return (
    <FinancePage
      title="Satın Alma"
      description="Ürün kataloğundan tedarikçiye teklif talebi oluşturun; gelen faturaları ayrı kaydedip açık borç ve ödemeleri izleyin. Talep oluşturmak gider veya stok hareketi oluşturmaz."
    >
      <Notice error={error} message={message} />
      <div className="mb-5 flex flex-wrap gap-3">
        <button className={buttonClass} onClick={() => setTab("REQUESTS")}>
          Satın alma talepleri
        </button>
        <button className={buttonClass} onClick={() => setTab("INVOICES")}>
          Gelen faturalar / Cari takip
        </button>
        <Link className={buttonClass} href="/urunler">
          Ürün kataloğu
        </Link>
      </div>
      {tab === "INVOICES" ? (
        <InvoiceWorkspace
          onSaved={async () => {
            await load();
          }}
        />
      ) : (
        <>
          <form
            className={panelClass}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2 className="mb-4 text-xl font-semibold">
              Yeni satın alma talebi
            </h2>
            <p className="mb-3 text-sm text-zinc-400">
              Oluşturan: {creatorEmail || "Microsoft oturumu gerekli"} ·
              Gönderim dili: Almanca
            </p>
            <fieldset disabled={busy} className="grid gap-4 md:grid-cols-3">
              <Field label="Tedarikçi">
                <select
                  required
                  className={inputClass}
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    setLines([]);
                    setAddId("");
                  }}
                >
                  <option value="">Tedarikçi seçin</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Talep tarihi">
                <input
                  className={inputClass}
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="İstenen teslim tarihi">
                <input
                  className={inputClass}
                  type="date"
                  min={date}
                  value={requiredDate}
                  onChange={(e) => setRequiredDate(e.target.value)}
                />
              </Field>
              <Field label="Ürün seç">
                <select
                  className={inputClass}
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                >
                  <option value="">Kataloğa bağlı ürün seçin</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className={buttonClass}
                disabled={!addId}
                onClick={() => {
                  setLines((current) => [
                    ...current,
                    { productId: addId, quantity: "1" },
                  ]);
                  setAddId("");
                }}
              >
                Talep listesine ekle
              </button>
              <Field label="Notlar / Teslim koşulları">
                <textarea
                  className={inputClass}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </fieldset>
            <div className="my-4 space-y-3">
              {lines.map((line, i) => {
                const product = products.find((p) => p.id === line.productId);
                return (
                  <div
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 p-3"
                    key={line.productId}
                  >
                    <span className="flex-1">
                      {product?.code} · {product?.name} ·{" "}
                      {units[product?.unit as keyof typeof units]}
                    </span>
                    <input
                      aria-label={`${product?.code} miktar`}
                      className={`${inputClass} max-w-32`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((current) =>
                          current.map((r, index) =>
                            index === i
                              ? { ...r, quantity: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, index) => index !== i),
                        )
                      }
                    >
                      Çıkar
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              className={buttonClass}
              disabled={busy || !lines.length || !creatorEmail}
            >
              Talebi kaydet
            </button>
            <p className="mt-3 text-sm text-zinc-400">
              Bu form teklif/fiyat talebidir; bağlayıcı sipariş veya ödeme
              değildir.
            </p>
          </form>
          <section className={`${panelClass} mt-6`}>
            <h2 className="mb-4 text-xl font-semibold">Talep listesi</h2>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Numara / Tarih",
                      "Tedarikçi",
                      "Oluşturan",
                      "E-posta",
                      "İşlem",
                    ].map((l) => (
                      <th className="p-3" key={l}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-800">
                      <td className="p-3">
                        {r.number}
                        <p>{dateLabel(r.date)}</p>
                      </td>
                      <td className="p-3">{r.supplier.name}</td>
                      <td className="p-3">{r.creatorEmail}</td>
                      <td className="p-3">
                        {statuses[r.emailStatus] || r.emailStatus}
                      </td>
                      <td className="p-3">
                        <button
                          className="underline"
                          onClick={() => {
                            setSelected(r.id);
                            setEmailConfirmed(false);
                          }}
                        >
                          Aç / Paylaş
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!requests.length ? (
                <p className="py-4 text-zinc-400">
                  Henüz talep yok.{" "}
                  <a
                    className="underline"
                    href="/api/integrations/onedrive/start"
                  >
                    Microsoft hesabınızla bağlanın.
                  </a>
                </p>
              ) : null}
            </div>
          </section>
          {current ? (
            <section className={`${panelClass} mt-6`}>
              <h2 className="mb-4 text-xl font-semibold">
                {current.number} · {current.supplier.name}
              </h2>
              <p className="text-sm text-zinc-400">
                Bilinen fiyatlardan tahmini net:{" "}
                {money(Number(current.estimatedNet))}. Tedarikçinin teklifiyle
                kesinleşir.
              </p>
              <div className="my-4 flex flex-wrap gap-3">
                <a
                  className={buttonClass}
                  href={`/api/purchase-requests/pdf?id=${current.id}`}
                >
                  PDF indir
                </a>
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void sharePdf()}
                >
                  PDF paylaş (telefon)
                </button>
                {whatsappNumber(current.supplier.phone) ? (
                  <a
                    className={buttonClass}
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://wa.me/${whatsappNumber(current.supplier.phone)}?text=${encodeURIComponent(current.message)}`}
                  >
                    WhatsApp’ta talep metnini aç
                  </a>
                ) : (
                  <p className="text-sm text-amber-300">
                    WhatsApp için tedarikçi telefonunu +ülke koduyla kaydedin.
                  </p>
                )}
              </div>
              <p className="mb-3 text-sm text-zinc-400">
                WhatsApp bağlantısı metni hazırlar. PDF’yi telefon paylaşımından
                veya indirerek ayrıca ekleyin; gönderimi WhatsApp’ta tamamlayın.
              </p>
              <p className="mb-2">Gönderen: {current.creatorEmail}</p>
              <p className="mb-2">
                Alıcı:{" "}
                {current.supplier.email || "Tedarikçinin e-postası eksik"}
              </p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 text-sm">
                {current.message}
              </pre>
              <p className="my-3 text-sm">Ek: {current.number}.pdf</p>
              {!mailConnected ? (
                <div className="my-4">
                  <p className="mb-3 text-sm text-amber-300">
                    E-posta, sizin Microsoft hesabınızdan gönderilir. Gönderme
                    iznini Microsoft onay ekranında etkinleştirmeniz gerekir.
                  </p>
                  <a
                    className={buttonClass}
                    href="/api/integrations/onedrive/start?mail=1"
                  >
                    Kendi Microsoft posta hesabımı bağla
                  </a>
                </div>
              ) : null}
              <label className="my-4 block text-sm">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={emailConfirmed}
                  onChange={(e) => setEmailConfirmed(e.target.checked)}
                />{" "}
                Alıcıyı, metni ve PDF ekini kontrol ettim; bu talebin kendi
                e-posta hesabımdan gönderilmesini onaylıyorum.
              </label>
              <button
                className={buttonClass}
                disabled={
                  busy ||
                  !mailConnected ||
                  !emailConfirmed ||
                  !current.supplier.email ||
                  !["NOT_SENT", "FAILED"].includes(current.emailStatus)
                }
                onClick={() => void send()}
              >
                Talebi e-posta ile gönder
              </button>
              <p className="mt-3 text-sm text-zinc-400">
                {statuses[current.emailStatus]}
              </p>
            </section>
          ) : null}
        </>
      )}
    </FinancePage>
  );
}
