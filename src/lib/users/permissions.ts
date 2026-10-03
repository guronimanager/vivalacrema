export const modules = {
  dashboard: { label: "Genel Bakış", path: "/" },
  sales: { label: "Satışlar", path: "/satislar" },
  bank: { label: "Banka ve Kasa", path: "/banka-kasa" },
  expenses: { label: "Giderler", path: "/giderler" },
  purchases: { label: "Satın Alma", path: "/satin-alma" },
  products: { label: "Ürünler", path: "/urunler" },
  employees: { label: "Personel", path: "/personel" },
  taxes: { label: "Vergiler", path: "/vergiler" },
  suppliers: { label: "Tedarikçiler", path: "/tedarikciler" },
  reports: { label: "Raporlar", path: "/raporlar" },
  archive: { label: "Evrak Arşivi", path: "/evraklar" },
  users: { label: "Kullanıcılar", path: "/kullanicilar" },
} as const;
export type Module = keyof typeof modules;
export type Permissions = Partial<Record<Module, "READ" | "WRITE">>;
export type Role = "ADMIN" | "ACCOUNTANT" | "STAFF";
export function validPermissions(value: unknown): Permissions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Sayfa yetkilerini kontrol edin.");
  for (const [key, level] of Object.entries(value)) {
    if (
      !Object.hasOwn(modules, key) ||
      !["READ", "WRITE"].includes(String(level))
    )
      throw new Error("Sayfa yetkilerini kontrol edin.");
  }
  return value as Permissions;
}
export function defaults(role: string): Permissions {
  return role === "ACCOUNTANT"
    ? {
        dashboard: "READ",
        bank: "WRITE",
        expenses: "WRITE",
        taxes: "WRITE",
        suppliers: "READ",
        reports: "READ",
        archive: "WRITE",
      }
    : {};
}
export function canAccess(
  user: { role: string; permissions: unknown },
  module: Module,
  write = false,
) {
  if (user.role === "ADMIN") return true;
  if (!["STAFF", "ACCOUNTANT"].includes(user.role) || module === "users")
    return false;
  let permissions: Permissions;
  try {
    permissions = validPermissions(user.permissions);
  } catch {
    return false;
  }
  return (
    permissions[module] === "WRITE" ||
    (!write && permissions[module] === "READ")
  );
}
export function moduleForPath(path: string): Module | null {
  const api: Record<string, Module> = {
    dashboard: "dashboard",
    sales: "sales",
    "bank-accounts": "bank",
    "bank-transactions": "bank",
    statements: "bank",
    expenses: "expenses",
    invoices: "expenses",
    "purchase-requests": "purchases",
    products: "products",
    employees: "employees",
    taxes: "taxes",
    suppliers: "suppliers",
    documents: "archive",
    users: "users",
    "db-test": "users",
  };
  if (path.startsWith("/api/"))
    return Object.hasOwn(api, path.split("/")[2])
      ? api[path.split("/")[2]]
      : null;
  return (
    (Object.entries(modules).find(
      ([, value]) => value.path === path,
    )?.[0] as Module) || null
  );
}
export function landing(user: { role: string; permissions: unknown }) {
  return (
    Object.entries(modules).find(([key]) => canAccess(user, key as Module))?.[1]
      .path || "/evraklarim"
  );
}
