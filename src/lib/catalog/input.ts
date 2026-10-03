import { Prisma } from "@prisma/client";
import { InputError, text, type Input } from "@/lib/record-input";
import { productKinds, units } from "./constants";
export { productKinds, units, prefixes } from "./constants";
const normalized = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]/gu, "");
export function decimal(value: unknown, places: number, zero = false) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(String(value))
  )
    throw new InputError(
      `Tutar/miktar en fazla ${places} ondalıkla pozitif olmalıdır.`,
    );
  const result = new Prisma.Decimal(value);
  if ((zero ? result.lt(0) : result.lte(0)) || result.gte(100000000))
    throw new InputError("Miktar/tutar sınırlarını kontrol edin.");
  return result;
}
export function productInput(body: Input) {
  const name = text(body, "name", true),
    brand = text(body, "brand"),
    packSize = text(body, "packSize"),
    category = text(body, "category", true),
    kind = text(body, "kind", true),
    unit = text(body, "unit", true);
  if (
    [name, brand, packSize, category].some((s) => s.length > 120) ||
    !normalized(name)
  )
    throw new InputError("Ürün alanları en fazla 120 karakter olmalıdır.");
  if (!Object.hasOwn(productKinds, kind) || !Object.hasOwn(units, unit))
    throw new InputError("Ürün türünü ve birimini seçin.");
  const identity = JSON.stringify([
    normalized(name),
    normalized(brand),
    normalized(packSize),
    kind,
    unit,
  ]);
  return {
    name,
    brand: brand || null,
    packSize: packSize || null,
    category,
    kind: kind as keyof typeof productKinds,
    unit,
    identity,
  };
}
