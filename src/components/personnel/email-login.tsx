"use client";
import { useState, type FormEvent } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Field, Notice, buttonClass, inputClass } from "@/components/finance/ui";
export function EmployeeEmailLogin() {
  const { signIn, fetchStatus } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!sent) {
        const created = await signIn.create({ identifier: email.trim().toLowerCase() });
        if (created.error) throw new Error("Bu e-posta ile giriş başlatılamadı. Yönetici onayını kontrol edin.");
        const result = await signIn.emailCode.sendCode();
        if (result.error) throw new Error("Doğrulama kodu gönderilemedi. Daha sonra yeniden deneyin.");
        setSent(true);
      } else {
        const result = await signIn.emailCode.verifyCode({ code });
        if (result.error) throw new Error("Kod geçersiz veya süresi dolmuş.");
        if (signIn.status !== "complete") throw new Error("Ek doğrulama gerekiyor. Yöneticinizle iletişime geçin.");
        await signIn.finalize({ navigate: () => { window.location.reload(); } });
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Giriş tamamlanamadı."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <Notice error={error} message={sent ? "Doğrulama kodu e-postanıza gönderildi. Spam klasörünü de kontrol edin." : ""} />
    <Field label="Yönetici onaylı e-posta adresiniz"><input required type="email" autoComplete="email" disabled={busy || sent} className={inputClass} value={email} onChange={event => setEmail(event.target.value)} /></Field>
    {sent ? <Field label="E-posta doğrulama kodu"><input required type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" className={inputClass} value={code} onChange={event => setCode(event.target.value)} /></Field> : null}
    <button disabled={busy || fetchStatus === "fetching"} className={buttonClass}>{busy ? "İşleniyor…" : sent ? "Kodu doğrula ve giriş yap" : "E-postama giriş kodu gönder"}</button>
    {sent ? <button type="button" className="ml-3 underline" disabled={busy} onClick={() => { signIn.reset(); setSent(false); setCode(""); }}>Başka e-posta / Yeniden başla</button> : null}
  </form>;
}
