import Link from "next/link";
import { PortalLogout } from "@/components/users/logout";
export default function Page() {
  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-white">
      <h1 className="text-2xl">Bu sayfaya erişim yetkiniz yok</h1>
      <p className="my-4">
        Yöneticinizden yetki isteyin veya başka bir onaylı hesapla giriş yapın.
      </p>
      <Link className="mr-6 underline" href="/giris">
        Giriş sayfası
      </Link>
      <PortalLogout />
    </main>
  );
}
