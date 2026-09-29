import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";

export const inputClass =
  "mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400";
export const buttonClass =
  "rounded-xl bg-white px-5 py-3 font-medium text-black disabled:opacity-50";
export const panelClass = "rounded-2xl border border-zinc-800 bg-zinc-900 p-6";

export function FinancePage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />
      <section className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">Finans Yönetimi</p>
          <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm text-zinc-400">{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-zinc-400">
      {label}
      {children}
    </label>
  );
}

export function Notice({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return error ? (
    <p
      role="alert"
      className="mb-6 rounded-xl border border-red-900 p-4 text-sm text-red-400"
    >
      {error}
    </p>
  ) : message ? (
    <p role="status" className="my-4 text-sm text-zinc-300">
      {message}
    </p>
  ) : null;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={panelClass}>
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}
