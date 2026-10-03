"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import {
  Field,
  inputClass,
  buttonClass,
  panelClass,
  Notice,
} from "@/components/finance/ui";
import { today, money } from "@/lib/finance";
import {
  archiveFolders,
  validateMetadata,
  type ArchiveFolder,
  type ArchiveDocument,
} from "@/lib/document-format";
import type { InvoiceOcr } from "@/lib/invoices/ocr";
interface Invoice {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  documentId: string;
  date: string;
  dueDate: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  overdue: boolean;
  payments: {
    id: string;
    date: string;
    amount: number;
    method: string;
    reference: string | null;
    transactionId: string | null;
  }[];
}
interface ExistingExpense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string | null;
}
interface Bank {
  id: string;
  date: string;
  amount: number;
  description: string | null;
}
type Document = Omit<ArchiveDocument, "accountId" | "pathname">;
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
const emptyDraft = () => ({
  existingExpenseId: "",
  supplierName: "",
  taxNumber: "",
  invoiceNumber: "",
  date: today(),
  dueDate: "",
  netAmount: "",
  vatAmount: "",
  totalAmount: "",
  description: "",
  kind: "INVOICE_MATERIAL",
  category: "Hammadde",
});
async function api(path: string, body?: object) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "İşlem tamamlanamadı.");
  return result;
}
export function InvoiceWorkspace({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [archiveFolder, setArchiveFolder] = useState<ArchiveFolder>(
    "02_Online_Rechnungen",
  );
  const [archivePeriod, setArchivePeriod] = useState(() => today().slice(0, 7));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [existingExpenses, setExistingExpenses] = useState<ExistingExpense[]>(
    [],
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ledgerError, setLedgerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [bankId, setBankId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [payment, setPayment] = useState({
    date: today(),
    amount: "",
    method: "BANK",
    reference: "",
  });
  const paymentRequest = useRef<string | null>(null);
  const [filter, setFilter] = useState("OPEN");
  async function refreshLedger() {
    try {
      const [ledger, bank] = await Promise.all([
        api("/api/invoices"),
        api("/api/invoices/payments"),
      ]);
      setInvoices(ledger.invoices);
      setExistingExpenses(ledger.unlinkedExpenses);
      setBanks(bank.transactions);
      setLedgerError("");
    } catch (reason) {
      setLedgerError(
        reason instanceof Error ? reason.message : "Cari takip yüklenemedi.",
      );
    }
  }
  useEffect(() => {
    let cancelled = false;
    api("/api/integrations/onedrive/status")
      .then(async (status) => {
        if (cancelled) return;
        setConnected(status.authenticated && status.connected);
        if (status.authenticated && status.connected) {
          const data = await api("/api/documents");
          if (!cancelled)
            setDocuments(
              data.documents.filter((d: Document) =>
                ["INVOICE_SERVICE", "INVOICE_MATERIAL"].includes(d.kind),
              ),
            );
          const results = await Promise.allSettled([
            api("/api/invoices"),
            api("/api/invoices/payments"),
          ]);
          if (cancelled) return;
          if (results[0].status === "fulfilled") {
            setInvoices(results[0].value.invoices);
            setExistingExpenses(results[0].value.unlinkedExpenses);
          } else setLedgerError(results[0].reason.message);
          if (results[1].status === "fulfilled")
            setBanks(results[1].value.transactions);
          else setLedgerError(results[1].reason.message);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function selectDocument(document: Document) {
    setDocumentId(document.id);
    setArchivePeriod(document.archivePeriod || document.date.slice(0, 7));
    setArchiveFolder(document.archiveFolder || "02_Online_Rechnungen");
    setDraft({
      ...emptyDraft(),
      date: document.date,
      supplierName:
        document.entity === "Fatura kontrolü bekliyor" ? "" : document.entity,
      kind: document.kind,
    });
    setWarnings([]);
  }
  async function uploadFile(file?: File) {
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    ) {
      setError(
        "En fazla 10 MB PDF, JPEG veya PNG seçin. HEIC fotoğrafı JPEG olarak dışa aktarın.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const metadata = validateMetadata({
        kind: draft.kind,
        entity: draft.supplierName || "Fatura kontrolü bekliyor",
        date: draft.date || today(),
        originalName: file.name,
        archiveFolder,
        archivePeriod,
      });
      const name =
        file.name
          .normalize("NFC")
          .replace(/[^\p{L}\p{N} ._()\-]/gu, "-")
          .replace(/\.\./g, "-")
          .slice(-100) || "fatura";
      const blob = await upload(
        `documents/files/${crypto.randomUUID()}/${name}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/documents/upload",
          clientPayload: JSON.stringify(metadata),
          multipart: file.size > 5 * 1024 * 1024,
        },
      );
      const data = await api("/api/documents", {
        pathname: blob.pathname,
        metadata,
        sync: false,
      });
      setDocuments((items) => [
        data.document,
        ...items.filter((item) => item.id !== data.document.id),
      ]);
      selectDocument(data.document);
      setMessage(
        "Belge yüklendi. OCR ile oku veya alanları doldur; fatura onayında OneDrive’a aktarılır.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Yükleme tamamlanamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importLink() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/documents/import", {
        url, archiveFolder, archivePeriod, kind: draft.kind, date: draft.date || today(),
      });
      setDocuments((items) => [
        data.document,
        ...items.filter((item) => item.id !== data.document.id),
      ]);
      selectDocument(data.document);
      setMessage("Bağlantıdaki belge yüklendi. Şimdi OCR ile okuyabilirsiniz.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Bağlantı yüklenemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function readOcr() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { result }: { result: InvoiceOcr } = await api(
        "/api/invoices/ocr",
        { documentId },
      );
      setWarnings(result.warnings);
      if (result.currency && result.currency !== "EUR")
        throw new Error(
          "Belge EUR değil. Tutarları otomatik aktarmadım; EUR tutarlarını kontrol ederek girin.",
        );
      setDraft((value) => ({
        ...value,
        supplierName: result.supplierName || "",
        taxNumber: result.taxNumber || "",
        invoiceNumber: result.invoiceNumber || "",
        date: result.date || value.date,
        dueDate: result.dueDate || "",
        netAmount: result.netAmount || "",
        vatAmount: result.vatAmount || "",
        totalAmount: result.totalAmount || "",
        kind: result.kind,
        description: result.description || "",
      }));
      setMessage(
        "OCR alanları doldurdu. Faturayla karşılaştırıp onaylayın; ödeme durumu OCR’dan çıkarılmaz.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "OCR tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/invoices", {
        ...draft,
        documentId,
        archiveFolder,
        archivePeriod,
      });
      setMessage(
        result.syncStatus === "SYNCED"
          ? "Fatura, tedarikçi ve gider kaydedildi; OneDrive aktarımı tamamlandı."
          : "Fatura kaydedildi. OneDrive aktarımını Evrak Arşivi’nden yeniden deneyin.",
      );
      setDraft(emptyDraft());
      setDocumentId("");
      setWarnings([]);
      await refreshLedger();
      await onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Fatura kaydedilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function savePayment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      paymentRequest.current ||= crypto.randomUUID();
      await api("/api/invoices/payments", {
        ...payment,
        invoiceId: selectedInvoice,
        paymentId: paymentId || null,
        transactionId: bankId || null,
        requestId: paymentRequest.current,
      });
      paymentRequest.current = null;
      setMessage("Ödeme kaydedildi; cari bakiye güncellendi.");
      setPayment({ date: today(), amount: "", method: "BANK", reference: "" });
      setBankId("");
      setPaymentId("");
      await refreshLedger();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Ödeme kaydedilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = invoices.filter(
    (invoice) =>
      filter === "ALL" ||
      (filter === "PAID"
        ? invoice.status === "PAID"
        : invoice.status !== "PAID"),
  );
  const grouped = Object.values(
    invoices.reduce<
      Record<
        string,
        { name: string; total: number; paid: number; open: number }
      >
    >((all, invoice) => {
      const item = (all[invoice.supplierId] ||= {
        name: invoice.supplierName,
        total: 0,
        paid: 0,
        open: 0,
      });
      item.total += invoice.totalAmount;
      item.paid += invoice.paidAmount;
      item.open += invoice.outstandingAmount;
      return all;
    }, {}),
  );
  return (
    <div className="mb-8 space-y-6">
      <div className={panelClass}>
        <h2 className="text-xl font-semibold">Fatura tarama ve cari takip</h2>
        <p className="mt-3 text-sm text-zinc-400">
          Fotoğraf çekin, PDF/fotoğraf seçin veya doğrudan dosya bağlantısını
          ekleyin. OCR taslağını kontrol edip onayladığınızda tedarikçi
          eşleştirilir/oluşturulur ve gider bir kez kaydedilir.
        </p>
        {connected === null ? (
          <p className="mt-3">Bağlantı kontrol ediliyor…</p>
        ) : !connected ? (
          <a href="/evraklar" className={`${buttonClass} mt-4 inline-block`}>
            OneDrive hesabımla giriş yap
          </a>
        ) : null}
      </div>
      <Notice error={error} message={message} />
      {connected ? (
        <>
          <div className={panelClass}>
            <h3 className="text-lg font-semibold">1. Belgeyi ekle</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Telefondan fotoğraf çek / tara">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  disabled={busy}
                  className={inputClass}
                  onChange={(event) => {
                    void uploadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </Field>
              <Field label="PDF veya fotoğraf yükle">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={busy}
                  className={inputClass}
                  onChange={(event) => {
                    void uploadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </Field>
              <label className="block text-sm text-zinc-400">
                Arşiv yılı ve ayı
                <input type="month" min="1900-01" max="2199-12" required
                  className={inputClass} value={archivePeriod} disabled={busy}
                  onChange={(event) => setArchivePeriod(event.target.value)} />
                <span className="mt-2 block">Belge tarihinden bağımsızdır. Yeni ve aktarım bekleyen belgeler bu döneme yerleştirilir; daha önce aktarılan belgeler taşınmaz.</span>
              </label>
              <Field label="OneDrive alt klasörü">
                <select
                  className={inputClass}
                  value={archiveFolder}
                  onChange={(event) =>
                    setArchiveFolder(event.target.value as ArchiveFolder)
                  }
                >
                  {archiveFolders.map((folder) => (
                    <option key={folder}>{folder}</option>
                  ))}
                </select>
              </Field>
              <Field label="Arşivden mevcut fatura seç">
                <select
                  value={documentId}
                  className={inputClass}
                  disabled={busy}
                  onChange={(event) => {
                    const doc = documents.find(
                      (d) => d.id === event.target.value,
                    );
                    if (doc) selectDocument(doc);
                    else setDocumentId("");
                  }}
                >
                  <option value="">Belge seçin</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName} · {d.date}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm text-zinc-400">
                Doğrudan HTTPS PDF/fotoğraf bağlantısı
                <input
                  className={inputClass}
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://.../fatura.pdf"
                />
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !url}
                onClick={importLink}
              >
                Bağlantıdan yükle
              </button>
            </div>
            <p className="mt-4 text-sm text-zinc-400">
              OCR’ye bastığınızda belge Vercel AI Gateway üzerinden yapay zekâ
              sağlayıcısına işlenmek üzere gönderilir. OCR ücretli kullanımı
              kredi durumuna bağlıdır.
            </p>
            <button
              type="button"
              className={`${buttonClass} mt-4`}
              disabled={busy || !documentId}
              onClick={readOcr}
            >
              {busy ? "İşleniyor…" : "OCR ile oku ve alanları doldur"}
            </button>
            {documentId ? (
              <a
                className="ml-4 underline"
                href={`/api/documents/download?id=${documentId}`}
                target="_blank"
                rel="noreferrer"
              >
                Orijinal belgeyi aç
              </a>
            ) : null}
          </div>
          {documentId ? (
            <form className={panelClass} onSubmit={save}>
              <h3 className="text-lg font-semibold">
                2. Bilgileri kontrol et ve faturayı kaydet
              </h3>
              {warnings.map((warning, i) => (
                <p className="mt-2 text-sm text-amber-300" key={i}>
                  {warning}
                </p>
              ))}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["supplierName", "Tedarikçi"],
                    ["taxNumber", "Vergi / USt-IdNr"],
                    ["invoiceNumber", "Fatura numarası"],
                    ["date", "Fatura tarihi"],
                    ["dueDate", "Vade tarihi"],
                    ["netAmount", "Net tutar (EUR)"],
                    ["vatAmount", "KDV tutarı (EUR)"],
                    ["totalAmount", "Brüt toplam (EUR)"],
                    ["description", "Açıklama"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      className={inputClass}
                      required={[
                        "supplierName",
                        "invoiceNumber",
                        "date",
                        "totalAmount",
                      ].includes(key)}
                      maxLength={key === "supplierName" ? 120 : 500}
                      type={
                        key.toLowerCase().includes("date")
                          ? "date"
                          : key.includes("Amount")
                            ? "number"
                            : "text"
                      }
                      step={key.includes("Amount") ? "0.01" : undefined}
                      min={key.includes("Amount") ? "0" : undefined}
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                ))}
                <Field label="Fatura türü">
                  <select
                    value={draft.kind}
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        kind: event.target.value,
                      }))
                    }
                  >
                    <option value="INVOICE_MATERIAL">Malzeme</option>
                    <option value="INVOICE_SERVICE">Hizmet / servis</option>
                  </select>
                </Field>
                <Field label="Gider kategorisi">
                  <select
                    value={draft.category}
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        category: event.target.value,
                      }))
                    }
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Önceden girilmiş gideri bağla (isteğe bağlı)">
                <select
                  className={inputClass}
                  value={draft.existingExpenseId}
                  onChange={(event) => {
                    const selected = existingExpenses.find(
                      (item) => item.id === event.target.value,
                    );
                    setDraft((value) => ({
                      ...value,
                      existingExpenseId: event.target.value,
                      ...(selected
                        ? {
                            date: selected.date,
                            category: selected.category,
                            totalAmount: String(selected.amount),
                          }
                        : {}),
                    }));
                  }}
                >
                  <option value="">Yeni gider oluştur</option>
                  {existingExpenses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.date} · {money(item.amount)} · {item.category} ·{" "}
                      {item.description}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="mt-4 text-sm text-zinc-400">
                Fatura kaydı başlangıçta açık borçtur. Ödenmişse aşağıdan ödeme
                ekleyin. Arşivden seçilen ve daha önce aktarılmış belgeler
                mevcut klasöründe kalır.
              </p>
              <button
                className={`${buttonClass} mt-4`}
                disabled={busy || Boolean(ledgerError)}
              >
                Bilgileri onayla ve faturayı kaydet
              </button>
            </form>
          ) : null}
          <div className={panelClass}>
            <h3 className="text-lg font-semibold">Tedarikçi cari bakiyeleri</h3>
            {ledgerError ? (
              <p className="mt-3 text-amber-300">{ledgerError}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-2">Tedarikçi</th>
                      <th className="p-2">Fatura toplamı</th>
                      <th className="p-2">Ödenen</th>
                      <th className="p-2">Açık borç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((item) => (
                      <tr key={item.name}>
                        <td className="p-2">{item.name}</td>
                        <td className="p-2">{money(item.total)}</td>
                        <td className="p-2">{money(item.paid)}</td>
                        <td className="p-2">{money(item.open)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!grouped.length ? <p>Henüz fatura kaydı yok.</p> : null}
              </div>
            )}
          </div>
          <div className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">
                Faturalar ve vade takibi
              </h3>
              <select
                className={inputClass}
                style={{ width: "auto" }}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="OPEN">Açık / kısmi</option>
                <option value="PAID">Kapalı</option>
                <option value="ALL">Tümü</option>
              </select>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Fatura</th>
                    <th className="p-2">Vade</th>
                    <th className="p-2">Toplam</th>
                    <th className="p-2">Açık</th>
                    <th className="p-2">Durum / ödemeler</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((invoice) => (
                    <tr className="border-t border-zinc-800" key={invoice.id}>
                      <td className="p-2">
                        {invoice.supplierName}
                        <p>
                          {invoice.invoiceNumber} · {invoice.date}
                        </p>
                        <a
                          className="underline"
                          href={`/api/documents/download?id=${invoice.documentId}`}
                        >
                          Belge
                        </a>
                      </td>
                      <td className="p-2">
                        {invoice.dueDate || "Belirtilmemiş"}
                        {invoice.overdue ? (
                          <p className="text-amber-300">Vadesi geçti</p>
                        ) : null}
                      </td>
                      <td className="p-2">{money(invoice.totalAmount)}</td>
                      <td className="p-2">
                        {money(invoice.outstandingAmount)}
                      </td>
                      <td className="p-2">
                        {invoice.status === "PAID"
                          ? "Kapalı"
                          : invoice.status === "PARTIAL"
                            ? "Kısmi ödeme"
                            : "Açık"}
                        {invoice.payments.map((p) => (
                          <p className="mt-1 text-xs text-zinc-400" key={p.id}>
                            {p.date} · {money(p.amount)} ·{" "}
                            {p.transactionId
                              ? "Banka eşleşmesi"
                              : "Manuel ödeme"}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <form className={panelClass} onSubmit={savePayment}>
            <h3 className="text-lg font-semibold">
              Ödeme ekle / banka hareketiyle eşleştir
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Açık fatura">
                <select
                  required
                  className={inputClass}
                  value={selectedInvoice}
                  onChange={(event) => {
                    setSelectedInvoice(event.target.value);
                    setBankId("");
                    setPaymentId("");
                    paymentRequest.current = null;
                  }}
                >
                  <option value="">Fatura seçin</option>
                  {invoices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.supplierName} · {i.invoiceNumber} ·{" "}
                      {money(i.outstandingAmount)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mevcut manuel banka ödemesini eşleştir (isteğe bağlı)">
                <select
                  value={paymentId}
                  className={inputClass}
                  onChange={(event) => {
                    setPaymentId(event.target.value);
                    paymentRequest.current = null;
                  }}
                >
                  <option value="">Yeni ödeme kaydı</option>
                  {(
                    invoices.find((i) => i.id === selectedInvoice)?.payments ||
                    []
                  )
                    .filter((p) => !p.transactionId && p.method === "BANK")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.date} · {money(p.amount)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Banka eşleştirmesi (isteğe bağlı)">
                <select
                  className={inputClass}
                  value={bankId}
                  onChange={(event) => {
                    setBankId(event.target.value);
                    const b = banks.find((b) => b.id === event.target.value);
                    if (b)
                      setPayment({
                        date: b.date,
                        amount: String(b.amount),
                        method: "BANK",
                        reference: b.description || "",
                      });
                    paymentRequest.current = null;
                  }}
                >
                  <option value="">Manuel ödeme</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.date} · {money(b.amount)} · {b.description}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ödeme tarihi">
                <input
                  required
                  type="date"
                  className={inputClass}
                  disabled={Boolean(bankId)}
                  value={payment.date}
                  onChange={(event) => {
                    setPayment((p) => ({ ...p, date: event.target.value }));
                    paymentRequest.current = null;
                  }}
                />
              </Field>
              <Field label="Ödenen tutar (EUR)">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={Boolean(bankId)}
                  className={inputClass}
                  value={payment.amount}
                  onChange={(event) => {
                    setPayment((p) => ({ ...p, amount: event.target.value }));
                    paymentRequest.current = null;
                  }}
                />
              </Field>
              <Field label="Ödeme yöntemi">
                <select
                  className={inputClass}
                  value={payment.method}
                  disabled={Boolean(bankId)}
                  onChange={(event) => {
                    setPayment((p) => ({ ...p, method: event.target.value }));
                    paymentRequest.current = null;
                  }}
                >
                  <option value="BANK">Banka</option>
                  <option value="CASH">Nakit</option>
                  <option value="CARD">Kart</option>
                </select>
              </Field>
              <Field label="Referans / açıklama">
                <input
                  maxLength={500}
                  className={inputClass}
                  value={payment.reference}
                  onChange={(event) => {
                    setPayment((p) => ({
                      ...p,
                      reference: event.target.value,
                    }));
                    paymentRequest.current = null;
                  }}
                />
              </Field>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              Ödeme kaydı cari borcu azaltır. Yeni gider veya banka hareketi
              oluşturmaz. Ekstre hareketini ayrıca Banka & Kasa’da kaydedin.
            </p>
            <button
              className={`${buttonClass} mt-4`}
              disabled={
                busy ||
                !selectedInvoice ||
                Boolean(ledgerError) ||
                Boolean(paymentId && !bankId)
              }
            >
              {paymentId
                ? "Mevcut ödemeyi banka ile eşleştir"
                : "Ödemeyi kaydet"}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
