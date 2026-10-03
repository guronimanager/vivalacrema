"use client";
import { useEffect, useState } from "react";
import { EmployeeEmailLogin } from "@/components/personnel/email-login";
import { buttonClass, panelClass } from "@/components/finance/ui";
export default function LoginPage() {
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok)
          window.location.replace((await response.json()).landing);
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
      <section className={`${panelClass} w-full max-w-md`}>
        <p className="text-zinc-400">Viva La Crema</p>
        <h1 className="my-4 text-2xl font-semibold">E-posta ile giriş</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Yöneticinizin onayladığı adresi kullanın. Yetkili olduğunuz sayfalar
          girişten sonra açılır.
        </p>
        {checking ? (
          <p>Oturum kontrol ediliyor…</p>
        ) : (
          <EmployeeEmailLogin afterLogin="/giris" />
        )}
        <a
          href="/api/integrations/onedrive/start"
          className={`${buttonClass} mt-6 block text-center`}
        >
          İşletme sahibi Microsoft girişi
        </a>
      </section>
    </main>
  );
}
