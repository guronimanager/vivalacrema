"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { clientApi } from "@/lib/client-api";
import { Field, Notice, buttonClass, inputClass, panelClass } from "@/components/finance/ui";

interface Employee { id: string; name: string; active: boolean }
interface Profile { id: string; employeeId: string | null; email: string; accessState: string; role: string }
export function EmployeeLoginAccess({ employees }: { employees: Employee[] }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let ignore = false;
    clientApi<{ records: Profile[] }>("/api/users").then(data => {
      if (!ignore) { setProfiles(data.records); setError(""); }
    }).catch(reason => { if (!ignore) setError(reason.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [version]);
  const employee = employees.find(value => value.id === employeeId);
  const profile = profiles.find(value => value.employeeId === employeeId);
  const managementProfile = Boolean(profile && profile.role !== "STAFF");
  function selectEmployee(id: string) {
    const current = profiles.find(value => value.employeeId === id);
    setEmployeeId(id); setEmail(current?.email || "");
    setApproved(current?.role === "STAFF" && current.accessState === "ACTIVE");
    setMessage("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || managementProfile || loading || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await clientApi<{ record: Profile }>("/api/users", {
        ...(profile ? { id: profile.id } : {}), name: employee.name, email: email.trim().toLowerCase(),
        role: "STAFF", employeeId, documentAccess: approved,
      }, profile ? "PATCH" : "POST");
      setProfiles(current => [...current.filter(value => value.id !== data.record.id), data.record]);
      setEmail(data.record.email);
      setApproved(data.record.accessState === "ACTIVE");
      setMessage(data.record.accessState === "ACTIVE" ? "Giriş e-postası yönetici tarafından onaylandı. Personel yalnızca kendi evraklarına erişebilir." : "E-posta kaydedildi. Yönetici onayı kapalı; personel giriş yapamaz.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Giriş e-postası kaydedilemedi."); }
    finally { setBusy(false); }
  }
  return <section className={`${panelClass} mt-6`} aria-label="Personel giriş e-postası ve yönetici onayı">
    <h2 className="text-xl font-semibold">Personel giriş e-postası ve yönetici onayı</h2>
    <p className="mt-3 text-sm text-zinc-400">Her personele bir giriş e-postası tanımlayın. Yönetici onayı kapalıysa giriş yapılamaz. E-posta değiştiğinde onayınızı yeniden seçin.</p>
    <Notice error={error} message={message} />
    <button type="button" className="my-4 text-sm underline" disabled={busy || loading} onClick={() => { setLoading(true); setVersion(value => value + 1); setEmployeeId(""); setEmail(""); setApproved(false); }}>Giriş e-postalarını yenile</button>
    <form onSubmit={save}>
      <fieldset disabled={loading || busy} className="grid gap-4 md:grid-cols-2">
        <Field label="Personel"><select required className={inputClass} value={employeeId} onChange={event => selectEmployee(event.target.value)}><option value="">Personel seçin</option>{employees.map(value => <option key={value.id} value={value.id}>{value.name}{value.active ? "" : " (Pasif)"}</option>)}</select></Field>
        <Field label="Yönetici onaylı personel e-postası"><input type="email" required maxLength={254} autoComplete="off" disabled={!employee || managementProfile} className={inputClass} value={email} onChange={event => { setEmail(event.target.value); setApproved(false); }} /></Field>
        <Field label="Evrak gönderimini ve personel girişini onaylıyorum"><input type="checkbox" checked={approved} disabled={!employee?.active || managementProfile} onChange={event => setApproved(event.target.checked)} /></Field>
      </fieldset>
      {managementProfile ? <p className="mt-4 text-sm text-amber-300">Bu personelin yönetici veya muhasebe profili var. <Link href="/kullanicilar" className="underline">Kullanıcılar sayfasından yönetin.</Link></p> : null}
      <p className="mt-4 text-sm text-zinc-400">Evraklar bu adrese gönderilir; Gmail dahil tüm adresler desteklenir. Portal girişi e-posta doğrulama koduyla yapılır. Onayı kaldırmak veya e-postayı değiştirmek açık personel oturumunu geçersiz kılar.</p>
      <button disabled={busy || loading || !employee || managementProfile} className={`${buttonClass} mt-4`}>{busy ? "Kaydediliyor…" : "Giriş e-postası ve onayı kaydet"}</button>
    </form>
    <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Personel</th><th className="p-3">Giriş e-postası</th><th className="p-3">Yönetici onayı</th><th className="p-3">İşlem</th></tr></thead><tbody>{!loading && !error && employees.map(value => {
      const current = profiles.find(p => p.employeeId === value.id);
      const enabled = value.active && current?.role === "STAFF" && current.accessState === "ACTIVE";
      return <tr key={value.id} className="border-t border-zinc-800"><td className="p-3">{value.name}</td><td className="p-3">{current?.email || "Tanımlanmadı"}</td><td className="p-3">{enabled ? "Onaylı" : "Giriş kapalı"}</td><td className="p-3"><button type="button" className="underline" disabled={busy} onClick={() => selectEmployee(value.id)}>E-posta / Onay düzenle</button></td></tr>;
    })}</tbody></table></div>
    <Link className="mt-4 inline-block underline" href="/evraklarim">Personel giriş ekranı</Link>
  </section>;
}
