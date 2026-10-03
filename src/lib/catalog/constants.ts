export const productKinds = {
  MATERIAL: "Malzeme",
  READY: "Hazır ürün",
  PRODUCED: "Üretim ürünü",
} as const;
export const units = {
  ADET: "Adet",
  KG: "kg",
  LITRE: "Litre",
  KOLI: "Koli",
} as const;
export const prefixes = {
  MATERIAL: "MAT",
  READY: "HAZ",
  PRODUCED: "URE",
} as const;
export interface CatalogProduct {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  packSize: string | null;
  category: string;
  kind: string;
  unit: string;
  active: boolean;
  suppliers: {
    supplierId: string;
    supplierCode: string | null;
    unitPrice: number | null;
    supplier: { id: string; name: string };
  }[];
}
export interface CatalogSupplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
}
