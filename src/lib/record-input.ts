import { Prisma } from "@prisma/client";

export class InputError extends Error {}
export type Input = Record<string, unknown>;

export async function readInput(request: Request): Promise<Input> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InputError("Geçerli bir istek gönderin.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Geçerli bir istek gönderin.");
  return value as Input;
}

export function text(input: Input, key: string, required = false) {
  const value = input[key];
  if (value != null && typeof value !== "string")
    throw new InputError("Metin alanlarını kontrol edin.");
  const result = (value as string | null | undefined)?.trim() ?? "";
  if ((required && !result) || result.length > 500)
    throw new InputError(
      "Zorunlu alanları doldurun; metinler en fazla 500 karakter olabilir.",
    );
  return result;
}

export function amount(input: Input, key: string) {
  const value = input[key];
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0 ||
    Number(value) >= 10000000000
  )
    throw new InputError("Geçerli, negatif olmayan bir EUR tutarı girin.");
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

export function flag(input: Input, key: string, fallback: boolean) {
  if (input[key] === undefined) return fallback;
  if (typeof input[key] !== "boolean")
    throw new InputError("Durum alanını kontrol edin.");
  return input[key] as boolean;
}

export function optionalDate(input: Input, key: string) {
  const value = text(input, key);
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new InputError("Geçerli bir tarih girin.");
  return date;
}

export function inputFailure(error: unknown) {
  return Response.json(
    {
      success: false,
      message:
        error instanceof InputError
          ? error.message
          : "İşlem tamamlanamadı. Yeniden deneyin.",
    },
    { status: error instanceof InputError ? 400 : 500 },
  );
}
