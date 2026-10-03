"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import { archiveFolders, defaultArchiveFolders, documentKinds, maximumFileSize, type ArchiveDocument, type ArchiveFolder, type DocumentKind } from "@/lib/document-format";
import { today } from "@/lib/finance";
import { buttonClass, Field, inputClass, Notice, panelClass } from "@/components/finance/ui";
type VisibleDocument = Omit<ArchiveDocument, "accountId" | "pathname">;
async function loadArchive(signal?: AbortSignal) {
  const response = await fetch("/api/integrations/onedrive/status", { cache: "no-store", signal });
  const status = await response.json();
  if (!response.ok) throw new Error(status.message || "Bağlantı durumu alınamadı.");
  let documents: VisibleDocument[] = [];
  if (status.authenticated) {
    const response = await fetch("/api/documents", { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Belgeler alınamadı.");
    documents = data.documents;
  }
  return { status: status as Status, documents };
}
interface Status { configured: boolean; authenticated: boolean; connected: boolean }
export function DocumentArchive({ connection, selectedEmployeeId }: { connection?: string; selectedEmployeeId?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [documents, setDocuments] = useState<VisibleDocument[]>([]);
  const [error, setError] = useState(connection === "failed" ? "Microsoft bağlantısı tamamlanamadı. Yetkili kişisel hesabınızı seçip yeniden deneyin." : "");
  const [message, setMessage] = useState(connection === "success" ? "Kişisel OneDrive hesabınız bağlandı." : "");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [employeeId, setEmployeeId] = useState(selectedEmployeeId || "");
  const [employeeFilter, setEmployeeFilter] = useState(selectedEmployeeId || "");
  const [kind, setKind] = useState<DocumentKind>(selectedEmployeeId ? "EMPLOYEE" : "INVOICE_MATERIAL");
  const [entity, setEntity] = useState("");
  const [date, setDate] = useState(today);
  const [archiveFolder, setArchiveFolder] = useState<ArchiveFolder>(selectedEmployeeId ? "06_Briefe" : "02_Online_Rechnungen");
  const refresh = useCallback(async () => {
    const result = await loadArchive();
    setStatus(result.status); setDocuments(result.documents);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadArchive(controller.signal).then(result => {
      if (!controller.signal.aborted) { setStatus(result.status); setDocuments(result.documents); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!status?.authenticated) return;
    const controller = new AbortController();
    fetch("/api/employees", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Personel listesi alınamadı.");
      if (!controller.signal.aborted) setEmployees(data.records);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [status?.authenticated]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) { setError("Yüklenecek dosyayı seçin."); return; }
    if (!file.size || file.size > maximumFileSize) { setError("Dosya en fazla 20 MB olmalıdır."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const employee = employees.find(value => value.id === employeeId);
      if (kind === "EMPLOYEE" && !employee) throw new Error("Belgenin ait olduğu personeli seçin.");
      const metadata = { kind, entity: kind === "EMPLOYEE" ? employee!.name : entity, date, originalName: file.name, archiveFolder, ...(kind === "EMPLOYEE" ? { employeeId } : {}) };
      const name = file.name.normalize("NFC").replace(/[^\p{L}\p{N} ._()\-]/gu, "-").replace(/\.\./g, "-").slice(-100);
      const pathname = `documents/files/${crypto.randomUUID()}/${name || "evrak"}`;
      const blob = await upload(pathname, file, { access: "private", handleUploadUrl: "/api/documents/upload", clientPayload: JSON.stringify(metadata), multipart: file.size > 5 * 1024 * 1024 });
      setMessage("Dosya özel arşive yüklendi. OneDrive aktarımı yapılıyor…");
      const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname: blob.pathname, metadata }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Belge kaydı tamamlanamadı.");
      setMessage(data.document.syncStatus === "SYNCED" ? "Belge arşive kaydedildi ve OneDrive’a aktarıldı." : "Belge özel arşivde saklandı. OneDrive aktarımı için yeniden deneyebilirsiniz.");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Yükleme tamamlanamadı."); }
    finally { setBusy(false); }
  }
  async function retry(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/documents/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Aktarım tamamlanamadı.");
      setMessage(data.document.syncStatus === "SYNCED" ? "OneDrive aktarımı tamamlandı." : data.document.syncMessage);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aktarım tamamlanamadı."); }
    finally { setBusy(false); }
  }
  async function assignEmployee(id: string, employeeId: string) {
    if (!employeeId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, employeeId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Personel bağlantısı kaydedilemedi.");
      setMessage("Belge seçtiğiniz personele bağlandı; erişimi açık olan personel evrakı indirebilir.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Personel bağlantısı kaydedilemedi."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { const response = await fetch("/api/integrations/onedrive/logout", { method: "POST" }); if (!response.ok) throw new Error("Çıkış yapılamadı."); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Çıkış yapılamadı."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <Notice error={error} message={message} />
    <div className={panelClass}>
      <h2 className="text-xl font-semibold">Kişisel OneDrive arşivi</h2>
      <p className="mt-3 text-sm text-zinc-400">5.Viva La Crema / VLC UG [yıl] / [yıl.ay]_[Almanca ay adı] / Mevcut belge klasörü</p>
      <p className="mt-3 text-sm text-zinc-400">Orijinal dosyalar özel arşivde saklanır. Aynı dosya tekrar yüklendiğinde içerik kontrolüyle ikinci belge kaydı oluşturulmaz.</p>
      {!status ? <p className="mt-4 text-zinc-400">Bağlantı kontrol ediliyor…</p> : !status.configured ? <p role="status" className="mt-4 text-amber-300">OneDrive bağlantı ayarları eksik.</p> : !status.authenticated || !status.connected ? <a className={`${buttonClass} mt-5 inline-block`} href="/api/integrations/onedrive/start">Microsoft hesabımla bağlan</a> : <div className="mt-5 flex items-center gap-4"><span className="text-emerald-400">OneDrive bağlı</span><button type="button" disabled={busy} onClick={logout} className="text-sm text-zinc-400 underline">Oturumu kapat</button></div>}
    </div>
    {status?.authenticated && status.connected ? <>
      <form className={panelClass} onSubmit={submit}>
        <h2 className="mb-5 text-xl font-semibold">Evrak yükle</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Belge türü"><select className={inputClass} value={kind} onChange={event => { const next = event.target.value as DocumentKind; setKind(next); setArchiveFolder(defaultArchiveFolders[next]); }}>{Object.entries(documentKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          {kind === "EMPLOYEE" ? <Field label="Belgenin ait olduğu personel"><select required className={inputClass} value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Personel seçin</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field> : <Field label="Tedarikçi / Banka / İlgili kurum"><input required maxLength={120} className={inputClass} value={entity} onChange={event => setEntity(event.target.value)} /></Field>}
          <Field label="OneDrive alt klasörü"><select className={inputClass} value={archiveFolder} onChange={event => setArchiveFolder(event.target.value as ArchiveFolder)}>{archiveFolders.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></Field>
          <Field label="Belge tarihi"><input required type="date" className={inputClass} value={date} onChange={event => setDate(event.target.value)} /></Field>
          <Field label="Dosya (en fazla 20 MB)"><input ref={fileInput} required type="file" accept=".pdf,.jpg,.jpeg,.png,.csv,.docx,.xlsx" className={inputClass} /></Field>
        </div>
        <p className="mt-4 text-sm text-zinc-400">Belge tarihi hedef ayı belirler. Maaş bordroları için 05_Lohnabrechnungen, diğer personel evrakları için uygun alt klasörü seçin. Bu yükleme evrakı arşivler. Fatura tutarı, ödeme, tedarikçi ve stok kayıtları ayrıca işlenmelidir.</p>
        <button type="submit" disabled={busy} className={`${buttonClass} mt-5`}>{busy ? "İşleniyor…" : "Yükle ve OneDrive’a aktar"}</button>
      </form>
      <div className={panelClass}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Arşivlenen evraklar</h2><button type="button" className="text-sm underline" disabled={busy} onClick={() => refresh().catch(reason => setError(reason.message))}>Yenile</button></div>
        <div className="mt-4"><Field label="Personel evraklarını filtrele"><select className={inputClass} value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)}><option value="">Tüm evraklar</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field></div>
        {documents.some(document => document.kind === "EMPLOYEE" && !document.employeeId) ? <p className="mt-4 text-sm text-amber-300">Eski personel evrakları kişi kaydına bağlı değilse personel girişinde görünmez. Mevcut belgeler otomatik olarak isimle eşleştirilmez.</p> : null}
        {!documents.filter(document => !employeeFilter || document.employeeId === employeeFilter).length ? <p className="mt-5 text-zinc-400">Henüz evrak yüklenmedi.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="p-3">Belge</th><th className="p-3">Tür / İlgili</th><th className="p-3">OneDrive</th><th className="p-3">İşlem</th></tr></thead><tbody>{documents.filter(document => !employeeFilter || document.employeeId === employeeFilter).map(document => <tr key={document.id} className="border-t border-zinc-800"><td className="p-3"><p>{document.originalName}</p><p className="mt-1 text-xs text-zinc-400">{document.date} · {(document.size / 1024).toFixed(0)} KB</p></td><td className="p-3">{documentKinds[document.kind]}<p className="mt-1 text-zinc-400">{document.entity}</p></td><td className="max-w-sm p-3"><p className={document.syncStatus === "SYNCED" ? "text-emerald-400" : "text-amber-300"}>{document.syncStatus === "SYNCED" ? "Aktarıldı" : document.syncStatus === "PENDING" ? "Aktarım bekliyor" : "Aktarım başarısız"}</p><p className="mt-1 break-all text-xs text-zinc-500">{document.oneDrivePath}</p>{document.syncMessage ? <p className="mt-1 text-xs text-amber-300">{document.syncMessage}</p> : null}</td><td className="p-3"><a className="underline" href={`/api/documents/download?id=${document.id}`}>İndir</a>{document.kind === "EMPLOYEE" && !document.employeeId ? <Field label={`${document.originalName} için personeli bağla`}><select disabled={busy} value="" className={`${inputClass} mt-2`} onChange={event => void assignEmployee(document.id, event.target.value)}><option value="">Personeli bağla</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field> : null}{document.syncStatus !== "SYNCED" ? <button type="button" disabled={busy} className="ml-4 underline disabled:opacity-50" onClick={() => retry(document.id)}>Aktarımı yeniden dene</button> : null}</td></tr>)}</tbody></table></div>}
      </div>
    </> : null}
  </div>;
}
