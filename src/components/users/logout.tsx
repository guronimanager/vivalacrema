"use client";
import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
export function PortalLogout() {
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className="text-sm underline disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          const response = await fetch("/api/auth/logout", { method: "POST" });
          if (!response.ok) throw new Error();
          await clerk.signOut({ redirectUrl: "/giris" });
        } catch {
          setBusy(false);
        }
      }}
    >
      Oturumu kapat
    </button>
  );
}
