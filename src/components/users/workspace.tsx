"use client";
import { useEffect, useState } from "react";
import {
  FinancePage,
  Field,
  Notice,
  inputClass,
  buttonClass,
  panelClass,
} from "@/components/finance/ui";
import { clientApi } from "@/lib/client-api";
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  accessState: string;
  employeeId: string | null;
  employee: { name: string } | null;
}
const blank = () => ({
  id: "",
  name: "",
  email: "",
  role: "STAFF",
  employeeId: "",
  documentAccess: false,
});
export function UsersWorkspace() {
  const [records, setRecords] = useState<User[]>([]),
    [employees, setEmployees] = useState<{ id: string; name: string }[]>([]),
    [currentEmail, setCurrentEmail] = useState(""),
    [draft, setDraft] = useState(blank),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let ignore = false;
    Promise.all([
      clientApi<{ records: User[]; currentEmail: string }>("/api/users"),
      clientApi<{ records: { id: string; name: string }[] }>("/api/employees"),
    ])
      .then(([u, e]) => {
        if (!ignore) {
          setRecords(u.records);
          setCurrentEmail(u.currentEmail);
          setEmployees(e.records);
        }
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [version]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await clientApi("/api/users", draft, draft.id ? "PATCH" : "POST");
      setDraft(blank());
      setVersion((v) => v + 1);
      setMessage(draft.documentAccess ? "Personelin yalnızca kendi evraklarına giriş yetkisi açıldı." : "Profil kaydedildi. Personel evrak erişimi kapalı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FinancePage
      title="Kullanıcılar"
      description="Personeli Microsoft hesabına bağlayın ve kendi evraklarına erişimini yönetin."
    >
      <p className="mb-5 text-sm text-zinc-400">
        Mevcut oturum: {currentEmail || "Microsoft bağlantısı gerekli"}. Satın
        alma e-postalarında talebi oluşturan oturumun doğrulanmış adresi
        kullanılır.
      </p>
      <Notice error={error} message={message} />
      <form
        className={panelClass}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="mb-4 text-xl">
          {draft.id ? "Profili düzenle" : "Kullanıcı profili oluştur"}
        </h2>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          <Field label="Ad soyad">
            <input
              className={inputClass}
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="E-posta">
            <input
              className={inputClass}
              required
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Planlanan rol">
            <select
              className={inputClass}
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value, documentAccess: false })}
            >
              <option value="STAFF">Personel</option>
              <option value="ADMIN">Yönetici</option>
            </select>
          </Field>
          <Field label="Personel kaydı">
            <select
              className={inputClass}
              value={draft.employeeId}
              onChange={(e) =>
                setDraft({ ...draft, employeeId: e.target.value, documentAccess: false })
              }
            >
              <option value="">Bağlantı yok</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kendi evraklarına giriş yetkisi">
            <input type="checkbox" checked={draft.documentAccess} disabled={draft.role !== "STAFF" || !draft.employeeId} onChange={e => setDraft({ ...draft, documentAccess: e.target.checked })} />
          </Field>
        </fieldset>
        <p className="mt-4 text-sm text-zinc-400">Personelin kişisel Microsoft hesabındaki e-posta adresini girin. Erişim açıldığında /evraklarim üzerinden yalnızca kendisine bağlı belgeleri indirir. Yönetici rolü henüz ek giriş yetkisi vermez.</p>
        <button className={`${buttonClass} mt-4`} disabled={busy}>
          Profili kaydet
        </button>
        <button
          type="button"
          className="ml-4 underline"
          onClick={() => setDraft(blank())}
        >
          Yeni profil
        </button>
      </form>
      <section className={`${panelClass} mt-6`}>
        <h2 className="mb-4 text-xl">Kullanıcılar</h2>
        <a className="mb-4 inline-block underline" href="/evraklarim">Personel evrak giriş sayfası</a>
        {records.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap justify-between gap-3 border-t border-zinc-700 py-4"
          >
            <div>
              {u.name} · {u.email}
              <p className="text-sm text-zinc-400">
                {u.role === "ADMIN" ? "Yönetici" : "Personel"} ·{" "}
                {u.employee?.name || "Personel bağlantısı yok"} · {u.accessState === "ACTIVE" ? "Kendi evraklarına erişim açık" : "Giriş etkin değil"}
              </p>
            </div>
            <button
              className="underline"
              onClick={() =>
                setDraft({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  role: u.role,
                  employeeId: u.employeeId || "",
                  documentAccess: u.accessState === "ACTIVE",
                })
              }
            >
              Düzenle
            </button>
          </div>
        ))}
      </section>
    </FinancePage>
  );
}
