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
  BadgeTurkishLira,
  Truck,
  ChartNoAxesCombined,
} from "lucide-react";

const items = [
  { label: "Genel Bakış", href: "/", icon: LayoutDashboard },
  { label: "Satışlar", href: "/satislar", icon: ShoppingCart },
  { label: "Banka & Kasa", href: "/banka-kasa", icon: Landmark },
  { label: "Giderler", href: "/giderler", icon: ReceiptText },
  { label: "Satın Alma", href: "/satin-alma", icon: PackageSearch },
  { label: "Personel", href: "/personel", icon: Users },
  { label: "Vergiler", href: "/vergiler", icon: BadgeTurkishLira },
  { label: "Tedarikçiler", href: "/tedarikciler", icon: Truck },
  { label: "Raporlar", href: "/raporlar", icon: ChartNoAxesCombined },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="min-h-screen w-64 border-r border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-10">
        <h1 className="text-xl font-bold text-white">Viva La Crema</h1>
        <p className="mt-1 text-xs text-zinc-500">İşletme Yönetimi</p>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                active
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
