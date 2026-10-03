"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { clientApi } from "@/lib/client-api";
import { today } from "@/lib/finance";
import {
  Field,
  inputClass,
  buttonClass,
  Notice,
} from "@/components/finance/ui";
import type { CatalogOcr } from "@/lib/catalog/ocr";
import type { InvoiceOcr } from "@/lib/invoices/ocr";
interface Doc {
  id: string;
  originalName: string;
  kind: string;
  date: string;
}
export type IntakeResult = {
  documentId: string;
  result: InvoiceOcr | CatalogOcr;
};
export function InvoiceIntake({
  catalog = false,
  onRead,
}: {
  catalog?: boolean;
  onRead: (data: IntakeResult) => void;
}) {
  const [documents, setDocuments] = useState<Doc[]>([]),
    [documentId, setDocumentId] = useState(""),
    [kind, setKind] = useState("INVOICE_MATERIAL"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let ignore = false;
    clientApi<{ documents: Doc[] }>("/api/documents")
      .then((data) => {
        if (!ignore)
          setDocuments(
            data.documents.filter((d) =>
              catalog
                ? d.kind === "INVOICE_MATERIAL"
                : ["INVOICE_MATERIAL", "INVOICE_SERVICE"].includes(d.kind),
            ),
          );
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [catalog]);
  async function read() {
    setBusy(true);
    setError("");
    try {
      if (!consent) throw new Error("OCR gönderimini onaylayın.");
      let id = documentId;
      if (!id) {
        const file = fileInput.current?.files?.[0];
        if (!file || !file.size || file.size > 10 * 1024 * 1024)
          throw new Error("En fazla 10 MB PDF/JPEG/PNG seçin.");
        const metadata = {
          kind: catalog ? "INVOICE_MATERIAL" : kind,
          entity: "Fatura",
          date: today(),
          originalName: file.name,
          archiveFolder: "02_Online_Rechnungen",
        };
        const name = file.name.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(-100);
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
        const saved = await clientApi<{ document: Doc }>("/api/documents", {
          pathname: blob.pathname,
          metadata,
          sync: false,
        });
        id = saved.document.id;
        setDocumentId(id);
      }
      const response = await clientApi<{ result: InvoiceOcr | CatalogOcr }>(
        catalog ? "/api/products/ocr" : "/api/invoices/ocr",
        { documentId: id },
      );
      onRead({ documentId: id, result: response.result });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="my-5 rounded-xl border border-zinc-700 p-4">
      <h3 className="mb-3 font-semibold">Fatura yükle / OCR ile oku</h3>
      <p className="mb-3 text-sm text-zinc-400">
        Belgeyi okumak tedarikçi, gider veya stok kaydı oluşturmaz. Alanları
        kontrol ederek aşağıda kaydedin.{" "}
        <a className="underline" href="/api/integrations/onedrive/start">
          Microsoft hesabımla bağlan
        </a>
      </p>
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        {!catalog ? (
          <Field label="Fatura türü">
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="INVOICE_MATERIAL">Malzeme</option>
              <option value="INVOICE_SERVICE">Hizmet/Servis</option>
            </select>
          </Field>
        ) : null}
        <Field label="Arşivdeki fatura">
          <select
            className={inputClass}
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
          >
            <option value="">Yeni dosya yükle</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.originalName}
              </option>
            ))}
          </select>
        </Field>
        {!documentId ? (
          <Field label="PDF / Fotoğraf">
            <input
              ref={fileInput}
              className={inputClass}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={() => setDocumentId("")}
            />
          </Field>
        ) : (
          <button
            type="button"
            className="underline"
            onClick={() => {
              setDocumentId("");
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            Başka belge seç
          </button>
        )}
      </fieldset>
      <label className="my-3 block text-sm">
        <input
          type="checkbox"
          disabled={busy}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />{" "}
        Belgenin Vercel AI Gateway üzerinden OCR için işlenmesini onaylıyorum.
      </label>
      <button
        type="button"
        className={buttonClass}
        disabled={busy || !consent}
        onClick={() => void read()}
      >
        {busy ? "Okunuyor…" : "Belgeyi oku"}
      </button>
      <Notice error={error} />
    </div>
  );
}
