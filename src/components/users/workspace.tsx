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
import {
  defaults,
  modules,
  type Module,
  type Permissions,
} from "@/lib/users/permissions";
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  accessState: string;
  permissions: Permissions;
  employeeId: string | null;
  employee: { name: string } | null;
}
const blank = () => ({
  id: "",
  name: "",
  email: "",
  role: "STAFF",
  employeeId: "",
  accessEnabled: false,
  permissions: {} as Permissions,
});
const roles: Record<string, string> = {
  ADMIN: "Yönetici",
  ACCOUNTANT: "Muhasebe",
  STAFF: "Personel",
};
export function UsersWorkspace() {
  const [records, setRecords] = useState<User[]>([]),
    [employees, setEmployees] = useState<{ id: string; name: string }[]>([]),
    [currentEmail, setCurrentEmail] = useState(""),
    [draft, setDraft] = useState(blank),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [search, setSearch] = useState("");
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
    setMessage("");
    try {
      await clientApi("/api/users", draft, draft.id ? "PATCH" : "POST");
      setDraft(blank());
      setVersion((v) => v + 1);
      setMessage(
        draft.accessEnabled
          ? "Kullanıcı ve sayfa yetkileri kaydedildi. Onaylı e-posta ile giriş açık."
          : "Kullanıcı kaydedildi; giriş kapalı.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FinancePage
      title="Kullanıcılar ve Yetkiler"
      description="E-posta ile giriş yapacak kullanıcıları, rollerini ve sayfa yetkilerini yönetin."
    >
      <p className="mb-5 text-sm text-zinc-400">
        Mevcut oturum: {currentEmail || "Kontrol ediliyor…"}.{" "}
        <a className="underline" href="/giris">
          Kullanıcı giriş sayfası
        </a>
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
          {draft.id ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
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
          <Field label="Giriş e-posta adresi">
            <input
              className={inputClass}
              required
              type="email"
              value={draft.email}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  email: e.target.value,
                  accessEnabled: false,
                })
              }
            />
          </Field>
          <Field label="Rol">
            <select
              className={inputClass}
              value={draft.role}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  role: e.target.value,
                  permissions: defaults(e.target.value),
                  accessEnabled: false,
                })
              }
            >
              {Object.entries(roles).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Personel bağlantısı (Personel rolü için gerekli)">
            <select
              className={inputClass}
              required={draft.role === "STAFF" && draft.accessEnabled}
              value={draft.employeeId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  employeeId: e.target.value,
                  accessEnabled: false,
                })
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
          <Field label="Bu e-posta ile girişi onaylıyorum">
            <input
              type="checkbox"
              checked={draft.accessEnabled}
              onChange={(e) =>
                setDraft({ ...draft, accessEnabled: e.target.checked })
              }
            />
          </Field>
        </fieldset>
        <p className="my-4 text-sm text-zinc-400">
          Giriş e-postası değiştiğinde onay yeniden seçilir. Erişim
          kapatıldığında mevcut oturumun sonraki isteği reddedilir. Personel
          yalnızca kendisine bağlı evraklara erişir; aşağıdan ek sayfalar
          verilebilir.
        </p>
        <h3 className="font-semibold">Sayfa yetkileri</h3>
        {draft.role === "ADMIN" ? (
          <p className="mt-3 text-sm text-zinc-400">
            Yönetici tüm sayfalara ve kullanıcı yönetimine erişir.
          </p>
        ) : (
          <fieldset disabled={busy} className="mt-3 grid gap-3 md:grid-cols-2">
            {Object.entries(modules)
              .filter(([key]) => key !== "users")
              .map(([key, value]) => (
                <Field key={key} label={value.label}>
                  <select
                    className={inputClass}
                    value={draft.permissions[key as Module] || ""}
                    onChange={(e) => {
                      const permissions = { ...draft.permissions };
                      if (e.target.value)
                        permissions[key as Module] = e.target.value as
                          | "READ"
                          | "WRITE";
                      else delete permissions[key as Module];
                      setDraft({ ...draft, permissions });
                    }}
                  >
                    <option value="">Erişim yok</option>
                    <option value="READ">Görüntüle</option>
                    <option value="WRITE">Görüntüle ve düzenle</option>
                  </select>
                </Field>
              ))}
          </fieldset>
        )}
        <p className="mt-4 text-sm text-zinc-400">
          Evrak Arşivi yetkisi işletme arşivindeki belgeleri kapsar. Fatura
          tarama için Giderler ve Evrak Arşivi, kullanıcı yönetimi için Yönetici
          rolü gerekir.
        </p>
        <button className={`${buttonClass} mt-4`} disabled={busy}>
          Kullanıcıyı ve yetkileri kaydet
        </button>
        <button
          type="button"
          className="ml-4 underline"
          disabled={busy}
          onClick={() => setDraft(blank())}
        >
          Yeni kullanıcı
        </button>
      </form>
      <section className={`${panelClass} mt-6`}>
        <h2 className="mb-4 text-xl">Kayıtlı kullanıcılar</h2>
        <Field label="İsim veya e-posta ile ara">
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        {records
          .filter((u) =>
            `${u.name} ${u.email}`
              .toLocaleLowerCase("tr")
              .includes(search.toLocaleLowerCase("tr")),
          )
          .map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap justify-between gap-3 border-t border-zinc-700 py-4"
            >
              <div>
                {u.name} · {u.email}
                <p className="text-sm text-zinc-400">
                  {roles[u.role] || u.role} ·{" "}
                  {u.employee?.name || "Personel bağlantısı yok"} ·{" "}
                  {u.accessState === "ACTIVE" ? "Giriş açık" : "Giriş kapalı"}
                </p>
              </div>
              <button
                className="underline"
                disabled={busy}
                onClick={() => {
                  setDraft({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    employeeId: u.employeeId || "",
                    accessEnabled: u.accessState === "ACTIVE",
                    permissions: u.permissions || {},
                  });
                  setMessage("");
                  setError("");
                }}
              >
                Düzenle
              </button>
            </div>
          ))}
        {!records.length ? (
          <p className="mt-4 text-zinc-400">Henüz kullanıcı kaydı yok.</p>
        ) : null}
      </section>
    </FinancePage>
  );
}
