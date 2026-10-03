"use client";
import { useEffect, useState } from "react";
import { buttonClass, Notice, panelClass } from "@/components/finance/ui";
import { dateLabel } from "@/lib/finance";
interface EmployeeDocument { id: string; originalName: string; date: string; size: number }
export function EmployeeArchive({ connection }: { connection?: string }) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState(connection === "failed" ? "Giriş tamamlanamadı. Yönetici, Microsoft e-postanızı personel kaydınıza bağlamalı ve evrak erişimini açmalıdır." : "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/personnel/documents", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Evraklar alınamadı.");
      if (!controller.signal.aborted) { setName(data.employee.name); setDocuments(data.documents); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/onedrive/logout", { method: "POST" });
      if (!response.ok) throw new Error("Çıkış yapılamadı.");
      setDocuments([]); setName(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Çıkış yapılamadı."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-4xl space-y-6 p-6 md:p-10">
    <header><p className="text-sm text-zinc-400">Viva La Crema</p><h1 className="mt-2 text-3xl font-semibold">Evraklarım</h1><p className="mt-3 text-zinc-400">Size ait bordro, sözleşme ve diğer personel belgelerini buradan indirin.</p></header>
    <Notice error={error} />
    {loading ? <p role="status">Oturum kontrol ediliyor…</p> : name ? <>
      <div className="flex justify-between gap-4"><h2 className="text-xl">{name}</h2><button disabled={busy} onClick={logout} className="underline">Çıkış yap</button></div>
      <section className={panelClass} aria-label="Kendi personel evraklarım">
        {!documents.length ? <p>Henüz size atanmış evrak yok. Yöneticinizle iletişime geçin.</p> : <ul className="divide-y divide-zinc-800">{documents.map(document => <li key={document.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p>{document.originalName}</p><p className="mt-1 text-sm text-zinc-400">{dateLabel(document.date)} · {(document.size / 1024).toFixed(0)} KB</p></div><a className={buttonClass} href={`/api/personnel/documents?id=${encodeURIComponent(document.id)}`}>İndir</a></li>)}</ul>}
      </section>
    </> : <section className={panelClass}><p className="mb-5 text-zinc-400">Yöneticinizin erişim verdiği kişisel Microsoft hesabını kullanın.</p><a className={`${buttonClass} inline-block`} href="/api/integrations/onedrive/start?employee=1">Microsoft hesabımla giriş yap</a></section>}
  </main>;
}
