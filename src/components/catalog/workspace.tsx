"use client";
import { useCallback, useEffect, useState } from "react";
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
import { money } from "@/lib/finance";
import {
  productKinds,
  units,
  type CatalogProduct,
  type CatalogSupplier,
} from "@/lib/catalog/constants";
import { InvoiceIntake, type IntakeResult } from "./intake";
import type { CatalogOcr } from "@/lib/catalog/ocr";
const blank = () => ({
  id: "",
  name: "",
  brand: "",
  packSize: "",
  category: "Hammadde",
  kind: "MATERIAL",
  unit: "ADET",
  supplierId: "",
  supplierCode: "",
  unitPrice: "",
  active: true,
});
type Item = {
  lineNumber: number;
  name: string;
  brand: string;
  packSize: string;
  supplierCode: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  kind: string;
  category: string;
  selected: boolean;
};
export function CatalogWorkspace() {
  const [products, setProducts] = useState<CatalogProduct[]>([]),
    [suppliers, setSuppliers] = useState<CatalogSupplier[]>([]),
    [draft, setDraft] = useState(blank),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [supplierFilter, setSupplierFilter] = useState(""),
    [basket, setBasket] = useState<string[]>([]),
    [documentId, setDocumentId] = useState(""),
    [documentDate, setDocumentDate] = useState(""),
    [items, setItems] = useState<Item[]>([]),
    [importSupplier, setImportSupplier] = useState(""),
    [supplierName, setSupplierName] = useState(""),
    [taxNumber, setTaxNumber] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      clientApi<{ products: CatalogProduct[] }>("/api/products"),
      clientApi<{ records: CatalogSupplier[] }>("/api/suppliers"),
    ]);
    setProducts(p.products);
    setSuppliers(s.records);
  }, []);
  useEffect(() => {
    // State updates in load happen only after the API response resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setError(e.message));
  }, [load]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await clientApi("/api/products", draft, draft.id ? "PATCH" : "POST");
      setDraft(blank());
      setMessage("Ürün ve tedarikçi bağlantısı kaydedildi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function read(data: IntakeResult) {
    const result = data.result as CatalogOcr;
    setDocumentId(data.documentId);
    setDocumentDate(result.invoiceDate || "");
    setSupplierName(result.supplierName || "");
    setTaxNumber(result.taxNumber || "");
    setImportSupplier(
      suppliers.find(
        (s) =>
          (s.taxNumber && s.taxNumber === result.taxNumber) ||
          s.name.toLocaleLowerCase("de-DE") ===
            result.supplierName?.toLocaleLowerCase("de-DE"),
      )?.id || "",
    );
    setItems(
      result.items.map((i) => ({
        ...i,
        brand: i.brand || "",
        packSize: i.packSize || "",
        supplierCode: i.supplierCode || "",
        unit: i.unit || "",
        quantity: i.quantity || "",
        unitPrice: i.unitPrice || "",
        kind: "MATERIAL",
        category: "Hammadde",
        selected: true,
      })),
    );
    setReviewed(false);
    setMessage(result.warnings.join("; "));
  }
  async function saveSupplier() {
    setBusy(true);
    setError("");
    try {
      const data = await clientApi<{ record: CatalogSupplier }>(
        "/api/suppliers",
        { name: supplierName, taxNumber, documentId, documentDate },
      );
      setImportSupplier(data.record.id);
      await load();
      setMessage("Faturanın tedarikçisi kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importItems() {
    setBusy(true);
    setError("");
    try {
      if (!reviewed || !documentDate)
        throw new Error(
          "Fatura tarihini ve ürün satırlarını kontrol edip onaylayın.",
        );
      const data = await clientApi<{
        records: { created: boolean }[];
        syncStatus: string;
      }>("/api/products/import", {
        documentId,
        documentDate,
        supplierId: importSupplier,
        confirmed: true,
        items: items.filter((i) => i.selected),
      });
      setMessage(
        `${data.records.filter((r) => r.created).length} fatura satırı kataloğa aktarıldı. Aynı belge satırları tekrar eklenmez. ${data.syncStatus === "SYNCED" ? "OneDrive arşivi tamamlandı." : "OneDrive aktarımını Evrak Arşivi’nden kontrol edin."}`,
      );
      setItems([]);
      setDocumentId("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = products.filter(
    (p) =>
      (!supplierFilter ||
        p.suppliers.some((s) => s.supplierId === supplierFilter)) &&
      `${p.code} ${p.name} ${p.brand || ""} ${p.suppliers.map((s) => `${s.supplier.name} ${s.supplierCode || ""}`).join(" ")}`
        .toLocaleLowerCase("tr-TR")
        .includes(search.toLocaleLowerCase("tr-TR")),
  );
  const canRequest =
    !!supplierFilter &&
    basket.length > 0 &&
    products
      .filter((p) => basket.includes(p.id))
      .every(
        (p) =>
          p.active && p.suppliers.some((s) => s.supplierId === supplierFilter),
      );
  const changeItem = (index: number, key: string, value: string | boolean) => {
    setItems((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
    setReviewed(false);
  };
  return (
    <FinancePage
      title="Ürünler"
      description="Tedarikçilere bağlı Viva La Crema ürün kataloğu. Kodlar kalıcıdır; ileride satış ve reçete takibinde aynı ürün kimliği kullanılacaktır."
    >
      <Notice error={error} message={message} />
      <form
        className={panelClass}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="mb-4 text-xl font-semibold">
          {draft.id ? "Ürünü düzenle / Tedarikçi bağla" : "Yeni ürün"}
        </h2>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-3">
          {[
            ["name", "Ürün adı"],
            ["brand", "Marka"],
            ["packSize", "Paket / Ölçü (örn. 80 g)"],
            ["category", "Kategori"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={inputClass}
                required={["name", "category"].includes(key)}
                maxLength={120}
                value={draft[key as "name"]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Ürün türü">
            <select
              className={inputClass}
              disabled={!!draft.id}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            >
              {Object.entries(productKinds).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Satın alma birimi">
            <select
              className={inputClass}
              disabled={!!draft.id}
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            >
              {Object.entries(units).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tedarikçi">
            <select
              className={inputClass}
              value={draft.supplierId}
              onChange={(e) => {
                const link = products
                  .find((p) => p.id === draft.id)
                  ?.suppliers.find((s) => s.supplierId === e.target.value);
                setDraft({
                  ...draft,
                  supplierId: e.target.value,
                  supplierCode: link?.supplierCode || "",
                  unitPrice:
                    link?.unitPrice === null || link?.unitPrice === undefined
                      ? ""
                      : String(link.unitPrice),
                });
              }}
            >
              <option value="">Daha sonra bağla</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tedarikçi ürün kodu">
            <input
              className={inputClass}
              maxLength={120}
              value={draft.supplierCode}
              onChange={(e) =>
                setDraft({ ...draft, supplierCode: e.target.value })
              }
            />
          </Field>
          <Field label="Net birim fiyatı (EUR)">
            <input
              className={inputClass}
              type="number"
              step="0.0001"
              min="0"
              value={draft.unitPrice}
              onChange={(e) =>
                setDraft({ ...draft, unitPrice: e.target.value })
              }
            />
          </Field>
        </fieldset>
        {draft.id ? (
          <label className="my-3 block text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />{" "}
            Aktif ürün
          </label>
        ) : null}
        <button className={`${buttonClass} mt-4`} disabled={busy}>
          Kaydet
        </button>
        {draft.id ? (
          <button
            type="button"
            className="ml-4 underline"
            onClick={() => setDraft(blank())}
          >
            Yeni ürün formuna dön
          </button>
        ) : null}
      </form>
      <section className={`${panelClass} mt-6`}>
        <h2 className="text-xl font-semibold">
          Faturadaki ürünleri kataloğa aktar
        </h2>
        <p className="mt-3 text-sm text-zinc-400">
          Ürün adı, marka, paket ölçüsü, satın alma birimi ve tedarikçi kodunu
          kontrol edin. Koli/adet dönüşümü yapılmaz; bu adım stok veya gider
          kaydı oluşturmaz.
        </p>
        <InvoiceIntake catalog onRead={read} />
        {items.length > 0 ? (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <Field label="Fatura tarihi / Arşiv ayı">
                <input
                  className={inputClass}
                  required
                  type="date"
                  value={documentDate}
                  onChange={(e) => {
                    setDocumentDate(e.target.value);
                    setReviewed(false);
                  }}
                />
              </Field>
              <Field label="Tedarikçi">
                <select
                  className={inputClass}
                  value={importSupplier}
                  onChange={(e) => {
                    setImportSupplier(e.target.value);
                    setReviewed(false);
                  }}
                >
                  <option value="">Seçin veya yeni kaydedin</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!importSupplier ? (
              <div className="my-3 grid gap-3 md:grid-cols-3">
                <Field label="Yeni tedarikçi adı">
                  <input
                    className={inputClass}
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </Field>
                <Field label="Vergi numarası">
                  <input
                    className={inputClass}
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                  />
                </Field>
                <button
                  className={buttonClass}
                  disabled={busy || !supplierName}
                  onClick={() => void saveSupplier()}
                >
                  Tedarikçiyi kaydet
                </button>
              </div>
            ) : null}
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Seç",
                      "Ürün / Marka / Ölçü",
                      "Tür / Kategori",
                      "Birim / Miktar",
                      "Tedarikçi kodu / Net EUR",
                    ].map((l) => (
                      <th key={l} className="p-2">
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr
                      key={item.lineNumber}
                      className="border-t border-zinc-800"
                    >
                      <td className="p-2">
                        <input
                          aria-label={`${i + 1}. satırı aktar`}
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) =>
                            changeItem(i, "selected", e.target.checked)
                          }
                        />
                      </td>
                      <td className="min-w-56 p-2">
                        {["name", "brand", "packSize"].map((k) => (
                          <input
                            key={k}
                            aria-label={`${i + 1}. satır ${k}`}
                            className={inputClass}
                            value={item[k as "name"]}
                            maxLength={120}
                            onChange={(e) => changeItem(i, k, e.target.value)}
                          />
                        ))}
                      </td>
                      <td className="min-w-40 p-2">
                        <select
                          aria-label={`${i + 1}. satır ürün türü`}
                          className={inputClass}
                          value={item.kind}
                          onChange={(e) =>
                            changeItem(i, "kind", e.target.value)
                          }
                        >
                          {Object.entries(productKinds).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${i + 1}. satır kategori`}
                          className={inputClass}
                          value={item.category}
                          onChange={(e) =>
                            changeItem(i, "category", e.target.value)
                          }
                        />
                      </td>
                      <td className="min-w-32 p-2">
                        <select
                          aria-label={`${i + 1}. satır birim`}
                          className={inputClass}
                          value={item.unit}
                          onChange={(e) =>
                            changeItem(i, "unit", e.target.value)
                          }
                        >
                          <option value="">Birim seçin</option>
                          {Object.entries(units).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${i + 1}. satır miktar`}
                          className={inputClass}
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={item.quantity}
                          onChange={(e) =>
                            changeItem(i, "quantity", e.target.value)
                          }
                        />
                      </td>
                      <td className="min-w-40 p-2">
                        <input
                          aria-label={`${i + 1}. satır tedarikçi kodu`}
                          className={inputClass}
                          value={item.supplierCode}
                          onChange={(e) =>
                            changeItem(i, "supplierCode", e.target.value)
                          }
                        />
                        <input
                          aria-label={`${i + 1}. satır net birim fiyatı`}
                          className={inputClass}
                          type="number"
                          step="0.0001"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) =>
                            changeItem(i, "unitPrice", e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="my-4 block text-sm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              Ürün satırlarını, miktarları, birimleri ve net EUR fiyatlarını
              kontrol ettim.
            </label>
            <button
              className={buttonClass}
              disabled={busy || !reviewed || !importSupplier || !documentDate}
              onClick={() => void importItems()}
            >
              Onaylanan ürünleri aktar
            </button>
          </>
        ) : null}
      </section>
      <section className={`${panelClass} mt-6`}>
        <h2 className="mb-4 text-xl font-semibold">Ürün kataloğu</h2>
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Field label="Kod / Ürün / Tedarikçi ara">
            <input
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Tedarikçi filtresi / Talep tedarikçisi">
            <select
              className={inputClass}
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
            >
              <option value="">Tüm tedarikçiler</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {canRequest ? (
          <Link
            className={`${buttonClass} mb-4 inline-block`}
            href={`/satin-alma?products=${basket.join(",")}&supplier=${supplierFilter}`}
          >
            {basket.length} üründen talep oluştur
          </Link>
        ) : (
          <p className="mb-4 text-sm text-zinc-400">
            Talep oluşturmak için ürünleri ve hepsine bağlı olan bir tedarikçiyi
            seçin.
          </p>
        )}
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Seç",
                  "Kod / Ürün",
                  "Tür / Birim",
                  "Tedarikçiler",
                  "İşlem",
                ].map((l) => (
                  <th key={l} className="p-3">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800">
                  <td className="p-3">
                    <input
                      aria-label={`${p.code} talep listesine ekle`}
                      type="checkbox"
                      disabled={!p.active}
                      checked={basket.includes(p.id)}
                      onChange={(e) =>
                        setBasket((current) =>
                          e.target.checked
                            ? [...current, p.id]
                            : current.filter((id) => id !== p.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-3">
                    {p.code}
                    <p>
                      {[p.brand, p.name, p.packSize]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {!p.active ? (
                      <span className="text-amber-300">Pasif</span>
                    ) : null}
                  </td>
                  <td className="p-3">
                    {productKinds[p.kind as keyof typeof productKinds]} /{" "}
                    {units[p.unit as keyof typeof units]}
                  </td>
                  <td className="p-3">
                    {p.suppliers.map((s) => (
                      <p key={s.supplierId}>
                        {s.supplier.name} · {s.supplierCode || "Kod yok"} ·{" "}
                        {s.unitPrice === null
                          ? "Fiyat yok"
                          : money(s.unitPrice)}
                      </p>
                    ))}
                  </td>
                  <td className="p-3">
                    <button
                      className="underline"
                      onClick={() =>
                        setDraft({
                          id: p.id,
                          name: p.name,
                          brand: p.brand || "",
                          packSize: p.packSize || "",
                          category: p.category,
                          kind: p.kind,
                          unit: p.unit,
                          supplierId: "",
                          supplierCode: "",
                          unitPrice: "",
                          active: p.active,
                        })
                      }
                    >
                      Düzenle / Tedarikçi bağla
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? (
            <p className="py-4 text-zinc-400">Bu filtrede ürün yok.</p>
          ) : null}
        </div>
      </section>
    </FinancePage>
  );
}
