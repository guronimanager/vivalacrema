"use client";
import { runDocumentBatch } from "@/lib/document-batch";
import { useRef, useState } from "react";
import { archiveFolders, type ArchiveFolder } from "@/lib/document-format";
import { today } from "@/lib/finance";
import {
  buttonClass,
  Field,
  inputClass,
  Notice,
  panelClass,
} from "@/components/finance/ui";
type RemoteFile = {
  id: string;
  name: string;
  size: number;
  supported: boolean;
  path: string;
};
export function OneDriveInventory({
  onRegistered,
  disabled = false,
  onBusyChange,
}: {
  onRegistered: () => Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const operationLock = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState("");
  const [period, setPeriod] = useState(() => today().slice(0, 7));
  const [folder, setFolder] = useState<ArchiveFolder>("02_Online_Rechnungen");
  const [subpath, setSubpath] = useState("");
  const [folders, setFolders] = useState<
    { id: string; name: string; subpath: string }[]
  >([]);
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<
    Record<string, { id: string; duplicate: boolean; invoice: boolean }>
  >({});
  const working = busy || disabled;
  async function action(body: object) {
    const response = await fetch("/api/documents/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "OneDrive taraması tamamlanamadı.");
    return data;
  }
  function reset() {
    setSelected([]);
    setFileErrors({});
    setProgress("");
    setSubpath("");
    setFiles([]);
    setFolders([]);
    setCursor(null);
    setScanned(false);
    setResults({});
    setMessage("");
    setError("");
  }
  async function scan(next = false, path = subpath) {
    if (working || operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setMessage("");
    try {
      const data = await action({
        action: "scan",
        period,
        folder,
        subpath: path,
        ...(next ? { cursor } : {}),
      });
      setFiles((previous) =>
        next
          ? [
              ...previous,
              ...data.files.filter(
                (file: RemoteFile) =>
                  !previous.some((item) => item.id === file.id),
              ),
            ]
          : data.files,
      );
      setSubpath(path);
      setFolders((previous) =>
        next
          ? [
              ...previous,
              ...data.folders.filter(
                (child: { id: string }) =>
                  !previous.some((item) => item.id === child.id),
              ),
            ]
          : data.folders,
      );
      setCursor(data.cursor);
      setScanned(true);
      if (!next) { setResults({}); setSelected([]); setFileErrors({}); setProgress(""); }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Tarama tamamlanamadı.",
      );
    } finally {
      operationLock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  async function registerFiles(requested: RemoteFile[]) {
    if (working || operationLock.current || !requested.length) return;
    operationLock.current = true;
    setBusy(true); onBusyChange?.(true); setError(""); setMessage("");
    let added = 0, duplicates = 0, failed = 0;
    setProgress(`0 / ${requested.length} belge kontrol edildi`);
    try {
      await runDocumentBatch(requested, file => action({ action: "register", period, folder, itemId: file.id, subpath }), (index, result) => {
        if (result.success) {
          const data = result.value;
          if (data.duplicate) duplicates++; else added++;
          setResults(previous => ({ ...previous, [requested[index].id]: { id: data.document.id, duplicate: data.duplicate, invoice: ["INVOICE_MATERIAL", "INVOICE_SERVICE"].includes(data.document.kind) } }));
          setSelected(previous => previous.filter(id => id !== requested[index].id));
          setFileErrors(previous => { const next = { ...previous }; delete next[requested[index].id]; return next; });
        } else {
          failed++;
          setFileErrors(previous => ({ ...previous, [requested[index].id]: result.message }));
        }
        setProgress(`${index + 1} / ${requested.length} belge kontrol edildi`);
      });
      setMessage(`${added} yeni belge portala alındı, ${duplicates} belge mevcut kayıtla eşleşti, ${failed} belge alınamadı. İkinci kayıt veya yeni gider oluşturulmadı. Hatalı belgeleri tekrar deneyebilirsiniz.`);
      if (added + duplicates > 0) await onRegistered();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Belge listesi yenilenemedi; yukarıdaki dosya sonuçlarını kontrol edin.");
    } finally { operationLock.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return (
    <section data-portal-mutation className={panelClass}>
      <h2 className="text-xl font-semibold">
        OneDrive’daki mevcut evrakları tara
      </h2>
      <p className="mt-3 text-sm text-zinc-400">
        Seçilen ay ve alt klasördeki dosyaları listeleyin; evrakları tek tek veya topluca seçip
        portala alın. Dosya adı yerine içerik karşılaştırılır. Mevcut
        OneDrive dosyası taşınmaz veya yeniden yüklenmez. Diğer aylar ve
        klasörler için taramayı tekrarlayın.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Tarama yılı ve ayı">
          <input
            disabled={working}
            type="month"
            min="1900-01"
            max="2199-12"
            className={inputClass}
            value={period}
            onChange={(event) => {
              reset();
              setPeriod(event.target.value);
            }}
          />
        </Field>
        <Field label="Taranacak OneDrive klasörü">
          <select
            disabled={working}
            className={inputClass}
            value={folder}
            onChange={(event) => {
              reset();
              setFolder(event.target.value as ArchiveFolder);
            }}
          >
            {archiveFolders.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
      </div>
      <button
        type="button"
        disabled={working}
        className={`${buttonClass} mt-4`}
        onClick={() => void scan()}
      >
        Mevcut evrakları tara
      </button>
      <div className="mt-4">
        <Notice error={error} message={message} />
      </div>
      <p className="mt-3 text-sm text-zinc-400">
        Faturayı tanıttıktan sonra “Fatura ve ödeme kontrolü” ile OCR
        bilgilerini doğrulayın. Kaydedilmiş faturayı Banka & Kasa’daki mevcut
        hareketle eşleştirin; yeni ödeme veya gideri tekrar oluşturmayın.
        Personel evrakları, yönetici ilgili personele bağlayana kadar personele
        açılmaz. Alt klasörleri açarak içlerindeki evrakları da tanıtabilirsiniz.
      </p>
      {scanned && !files.length ? (
        <p className="mt-4">Bu sayfada dosya bulunamadı.</p>
      ) : null}
      <p className="mt-3 text-sm text-zinc-400">
        Klasör: {folder}
        {subpath ? `/${subpath}` : ""}
      </p>
      {subpath ? (
        <button
          type="button"
          disabled={working}
          className="mt-2 underline"
          onClick={() =>
            void scan(false, subpath.split("/").slice(0, -1).join("/"))
          }
        >
          Üst klasöre dön
        </button>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        {folders.map((child) => (
          <button
            type="button"
            key={child.id}
            disabled={working}
            className={buttonClass}
            onClick={() => void scan(false, child.subpath)}
          >
            Klasör: {child.name}
          </button>
        ))}
      </div>
      {files.some(file => file.supported && !results[file.id]) ? <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="text-sm"><input type="checkbox" disabled={working} checked={files.filter(file => file.supported && !results[file.id]).every(file => selected.includes(file.id))} onChange={event => setSelected(event.target.checked ? files.filter(file => file.supported && !results[file.id]).map(file => file.id) : [])} /> Listelenen uygun belgeleri seç</label>
        <button type="button" className={buttonClass} disabled={working || !selected.length} onClick={() => void registerFiles(files.filter(file => selected.includes(file.id) && file.supported && !results[file.id]))}>Seçilenleri kontrol et ve portala al ({selected.length})</button>
        <p className="text-sm text-zinc-400">Seçim yalnızca aşağıda listelenen dosyaları kapsar. Diğer ayları/alt klasörleri ayrıca açın; sonraki dosyaları getirerek listeyi genişletin.</p>
      </div> : null}
      {progress ? <p role="status" className="mt-3 text-sm text-zinc-400">{progress}</p> : null}
      <ul className="mt-4 divide-y divide-zinc-800">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${file.name} belgesini seç`} disabled={working || !file.supported || Boolean(results[file.id])} checked={selected.includes(file.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, file.id] : previous.filter(id => id !== file.id))} />{file.name}</label>
              {fileErrors[file.id] ? <p role="alert" className="mt-1 text-sm text-red-400">{fileErrors[file.id]}</p> : null}
              <p className="text-xs text-zinc-400">
                {(file.size / 1024).toFixed(0)} KB ·{" "}
                {results[file.id]
                  ? results[file.id].duplicate
                    ? "Zaten mevcut — ikinci kayıt oluşturulmadı"
                    : "Sistemde tanındı"
                  : file.supported
                    ? "İçerik kontrolü bekliyor"
                    : "Desteklenmeyen tür veya 20 MB üzeri"}
              </p>
            </div>
            <div>
              {!results[file.id] ? (
                <button data-portal-mutation
                  type="button"
                  className={buttonClass}
                  disabled={working || !file.supported}
                  onClick={() => void registerFiles([file])}
                >
                  Kontrol et ve sisteme tanıt
                </button>
              ) : results[file.id].invoice ? (
                <a
                  className="underline"
                  href={`/giderler?document=${results[file.id].id}`}
                >
                  Fatura ve ödeme kontrolü
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {cursor ? (
        <button
          type="button"
          disabled={working}
          className={`${buttonClass} mt-4`}
          onClick={() => void scan(true)}
        >
          Sonraki dosyaları getir
        </button>
      ) : scanned ? (
        <p className="mt-3 text-sm text-zinc-400">
          Seçilen klasörün tüm liste sayfaları alındı. İçerik kontrolü için
          evrakları sisteme tanıtın.
        </p>
      ) : null}
    </section>
  );
}
