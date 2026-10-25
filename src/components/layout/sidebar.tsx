"use client";

import { useEffect, useRef, useState } from "react";
import { canAccess } from "@/lib/users/permissions";
import { PortalLogout } from "@/components/users/logout";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Landmark,
  ReceiptText,
  PackageSearch,
  Users,
  Euro,
  Truck,
  ChartNoAxesCombined,
  FolderArchive,
  Menu,
  X,
  Camera,
} from "lucide-react";

const items = [
  { label: "Genel Bakış", href: "/", icon: LayoutDashboard },
  { label: "Satışlar", href: "/satislar", icon: ShoppingCart },
  { label: "Banka & Kasa", href: "/banka-kasa", icon: Landmark },
  { label: "Giderler", href: "/giderler", icon: ReceiptText },
  { label: "Satın Alma", href: "/satin-alma", icon: PackageSearch },
  { label: "Ürünler", href: "/urunler", icon: PackageSearch },
  { label: "Kullanıcılar", href: "/kullanicilar", icon: Users },
  { label: "Personel", href: "/personel", icon: Users },
  { label: "Vergiler", href: "/vergiler", icon: Euro },
  { label: "Tedarikçiler", href: "/tedarikciler", icon: Truck },
  { label: "Raporlar", href: "/raporlar", icon: ChartNoAxesCombined },
  { label: "Evrak Arşivi", href: "/evraklar", icon: FolderArchive },
];

export function Sidebar() {
  const pathname = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  const [access, setAccess] = useState<{ path: string; pages: string[]; canUpload: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted) setAccess({
          path: pathname,
          pages: result.pages.map((page: { path: string }) => page.path),
          canUpload: canAccess(result.user, "expenses", true) && canAccess(result.user, "archive", true),
        });
      }).catch(() => {});
    return () => controller.abort();
  }, [pathname]);
  const current = access?.path === pathname ? access : null;
  const visible = items.filter(item => current?.pages.includes(item.href));
  const primary = visible.filter(item => ["/", "/banka-kasa", "/giderler", "/evraklar"].includes(item.href));

  return <>
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 p-5 md:block">
      <div className="mb-10">
        <h2 className="text-xl font-bold text-white">Viva La Crema</h2>
        <p className="mt-1 text-xs text-zinc-500">İşletme Yönetimi</p>
      </div>
      <nav aria-label="Ana menü" className="space-y-2">
        {visible.map(item => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${pathname === item.href ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>
            <Icon size={18} aria-hidden="true" />{item.label}
          </Link>;
        })}
      </nav>
      {current?.canUpload ? <Link href="/giderler#belge-yukle" className="mt-6 flex items-center gap-2 rounded-xl border border-zinc-600 px-4 py-3 text-sm text-white"><Camera size={18} aria-hidden="true" />Hızlı evrak yükle</Link> : null}
      <div className="mt-6"><PortalLogout /></div>
    </aside>

    <nav data-mobile-navigation aria-label="Mobil menü" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-zinc-700 bg-zinc-950 px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:hidden">
      {primary.map(item => {
        const quickUpload = item.href === "/giderler" && current?.canUpload;
        const Icon = quickUpload ? Camera : item.icon;
        const label = quickUpload ? "Evrak yükle" : item.label;
        return <Link key={item.href} href={quickUpload ? "/giderler#belge-yukle" : item.href}
          aria-label={label} aria-current={pathname === item.href ? "page" : undefined}
          className={`flex min-h-16 min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[10px] ${pathname === item.href ? "bg-zinc-800 text-white" : "text-zinc-400"}`}>
          <Icon size={21} aria-hidden="true" /><span>{label}</span>
        </Link>;
      })}
      <button type="button" aria-haspopup="dialog" aria-controls="mobile-menu" className="flex min-h-16 min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-zinc-300" onClick={() => menu.current?.showModal()}><Menu size={21} aria-hidden="true" />Tüm menü</button>
    </nav>

    <dialog ref={menu} id="mobile-menu" aria-labelledby="mobile-menu-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white backdrop:bg-black/70 md:hidden">
      <div className="mb-4 flex items-center justify-between"><h2 id="mobile-menu-title" className="text-lg font-semibold">Viva La Crema</h2><button type="button" aria-label="Menüyü kapat" className="rounded-lg p-3" onClick={() => menu.current?.close()}><X size={22} aria-hidden="true" /></button></div>
      <nav aria-label="Tüm sayfalar" className="grid grid-cols-2 gap-2">
        {visible.map(item => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}
            onClick={() => menu.current?.close()} className={`flex min-h-16 items-center gap-2 rounded-xl border p-3 text-sm ${pathname === item.href ? "border-white bg-white text-black" : "border-zinc-800 text-zinc-300"}`}><Icon size={18} aria-hidden="true" />{item.label}</Link>;
        })}
      </nav>
      <div className="mt-5 border-t border-zinc-800 pt-4"><PortalLogout /></div>
    </dialog>
  </>;
}
