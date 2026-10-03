"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  FinancePage,
  Field,
  Notice,
  Stat,
  buttonClass,
  inputClass,
  panelClass,
} from "./ui";
import { dateLabel, money, sumMoney } from "@/lib/finance";

type Value = string | number | boolean | null;
type RecordRow = { id: string; [key: string]: Value };
type RecordField = {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "checkbox";
  required?: boolean;
  defaultValue?: Value;
  format?: "money" | "date";
  trueLabel?: string;
  falseLabel?: string;
};

type Summary = {
  key: string;
  label: string;
  where?: { key: string; value: Value };
};

export function RecordManager({
  title,
  description,
  endpoint,
  fields,
  summaries = [],
  employeeDocuments = false,
}: {
  title: string;
  description: string;
  endpoint: string;
  fields: RecordField[];
  summaries?: Summary[];
  employeeDocuments?: boolean;
}) {
  const initial = useCallback(
    () =>
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.defaultValue ?? (field.type === "checkbox" ? false : ""),
        ]),
      ) as Record<string, Value>,
    [fields],
  );
  const [values, setValues] = useState(initial);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [editing, setEditing] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(
    () =>
      fetch(endpoint, { cache: "no-store" })
        .then(async (response) => {
          const result: { success: boolean; records: RecordRow[] } =
            await response.json();
          if (!response.ok || !result.success) throw new Error();
          setError("");
          setRecords(result.records);
        })
        .catch(() => setError("Kayıtlar yüklenemedi. Yeniden deneyin."))
        .finally(() => setLoading(false)),
    [endpoint],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setLoading(true);
    setError("");
    await load();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(editing ? { id: editing } : {}),
        }),
      });
      const result: { success: boolean; message?: string } =
        await response.json();
      if (!response.ok || !result.success) {
        setMessage(result.message ?? "Kayıt kaydedilemedi.");
        return;
      }
      setValues(initial());
      setEditing("");
      setMessage("Kayıt başarıyla kaydedildi.");
      await refresh();
    } catch {
      setMessage(
        "Bağlantı hatası. Yeniden kaydetmeden önce listeyi yenileyin.",
      );
    } finally {
      setSaving(false);
    }
  }

  function edit(record: RecordRow) {
    setEditing(record.id);
    setMessage("");
    setValues(
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.type === "date"
            ? String(record[field.key] ?? "").slice(0, 10)
            : (record[field.key] ?? field.defaultValue ?? ""),
        ]),
      ),
    );
  }

  function display(field: RecordField, value: Value | undefined) {
    if (field.type === "checkbox")
      return value
        ? (field.trueLabel ?? "Evet")
        : (field.falseLabel ?? "Hayır");
    if (value === null || value === undefined || value === "") return "—";
    if (field.format === "money") return money(Number(value));
    if (field.format === "date") return dateLabel(String(value));
    return String(value);
  }

  const visible = records.filter((record) =>
    fields.some((field) =>
      display(field, record[field.key])
        .toLocaleLowerCase("tr-TR")
        .includes(search.toLocaleLowerCase("tr-TR")),
    ),
  );

  return (
    <FinancePage title={title} description={description}>
      {employeeDocuments && <p className="mb-5 text-sm text-zinc-400">Personel evraklarını yönetmek için <Link className="underline" href="/evraklar">Evrak Arşivi’nden Microsoft hesabınızla giriş yapın</Link>. Personelin kendi evraklarına giriş yetkisi Kullanıcılar sayfasında açılır.</p>}
      <Notice error={error} />
      {summaries.length > 0 && (
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {summaries.map((summary) => (
            <Stat
              key={summary.label}
              label={summary.label}
              value={
                loading || error
                  ? "—"
                  : money(
                      sumMoney(
                        records
                          .filter(
                            (record) =>
                              !summary.where ||
                              record[summary.where.key] === summary.where.value,
                          )
                          .map((record) => Number(record[summary.key] ?? 0)),
                      ),
                    )
              }
            />
          ))}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={submit} className={panelClass}>
          <h2 className="mb-5 text-xl font-semibold">
            {editing ? "Kaydı Düzenle" : "Yeni Kayıt"}
          </h2>
          <div className="space-y-4">
            {fields.map((field) => (
              <Field key={field.key} label={field.label}>
                {field.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(values[field.key])}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.checked,
                      }))
                    }
                    className="ml-3 h-4 w-4"
                  />
                ) : (
                  <input
                    type={field.type ?? "text"}
                    required={field.required}
                    maxLength={500}
                    min={field.type === "number" ? "0" : undefined}
                    step={field.type === "number" ? "0.01" : undefined}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                )}
              </Field>
            ))}
            <div className="flex flex-wrap gap-3">
              <button className={buttonClass} disabled={saving}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              {editing && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setValues(initial());
                    setEditing("");
                    setMessage("");
                  }}
                  className="rounded-xl border border-zinc-700 px-4 py-3"
                >
                  Vazgeç
                </button>
              )}
            </div>
            <Notice message={message} />
          </div>
        </form>
        <div className={`${panelClass} xl:col-span-2`}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">
              Kayıtlar {loading || error ? "" : `(${visible.length})`}
            </h2>
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className={buttonClass}
            >
              {loading ? "Yükleniyor..." : "Yenile"}
            </button>
          </div>
          <Field label="Kayıtlarda ara">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th key={field.key} className="px-3 py-4">
                      {field.label}
                    </th>
                  ))}
                  <th className="px-3 py-4">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  !error &&
                  visible.map((record) => (
                    <tr key={record.id} className="border-t border-zinc-800">
                      {fields.map((field) => (
                        <td key={field.key} className="px-3 py-4">
                          {display(field, record[field.key])}
                        </td>
                      ))}
                      <td className="px-3 py-4">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => edit(record)}
                          className="text-zinc-300 underline disabled:opacity-50"
                        >
                          Düzenle
                        </button>
                        {employeeDocuments && <Link className="ml-4 underline" href={`/evraklar?employeeId=${encodeURIComponent(record.id)}`}>Evrakları / Yükle</Link>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(loading || error || !visible.length) && (
              <p role="status" className="py-6 text-zinc-500">
                {loading
                  ? "Kayıtlar yükleniyor..."
                  : error
                    ? "Kayıtlar gösterilemiyor."
                    : "Bu filtreye uygun kayıt yok."}
              </p>
            )}
          </div>
        </div>
      </div>
    </FinancePage>
  );
}
