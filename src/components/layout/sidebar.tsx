"use client";

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

  return (
    <aside className="min-h-screen w-16 shrink-0 border-r border-zinc-800 bg-zinc-950 p-2 md:w-64 md:p-5">
      <div className="mb-10">
        <p className="text-center font-bold md:hidden">VLC</p>
        <h1 className="hidden text-xl font-bold text-white md:block">
          Viva La Crema
        </h1>
        <p className="mt-1 hidden text-xs text-zinc-500 md:block">
          İşletme Yönetimi
        </p>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={`flex w-full items-center justify-center gap-3 rounded-xl px-2 py-3 md:justify-start md:px-4 text-sm transition ${
                active
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
