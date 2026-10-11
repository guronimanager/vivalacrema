"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Presentation only: API permissions remain the authority for every write. */
export function PortalReadOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<{ path: string; role: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const result = await response.json();
        if (active) setIdentity({ path: pathname, role: result.user.role });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [pathname]);
  const current = identity?.path === pathname ? identity : null;
  return <div data-portal-readonly={!current || current.role === "PARTNER"}>
    {current?.role === "PARTNER" ? <p role="status" className="border-b border-zinc-800 bg-zinc-900 px-5 py-3 text-sm text-zinc-300">Ortak erişimi: tüm sayfaları yalnızca görüntüleyebilirsiniz.</p> : null}
    {children}
  </div>;
}
