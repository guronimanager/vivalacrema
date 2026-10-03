export interface Period {
  start: string;
  end: string;
  endExclusive: string;
  label: string;
  days: number;
}
export function berlinToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function periodFor(start: string, end: string): Period {
  for (const date of [start, end])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(new Date(date).getTime()) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Geçerli başlangıç ve bitiş tarihlerini seçin.");
  const days =
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
    ) + 1;
  if (days < 1 || days > 366)
    throw new Error("En fazla 366 günlük bir dönem seçin.");
  const next = new Date(`${end}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const format = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("tr-TR", {
      timeZone: "Europe/Berlin",
    });
  return {
    start,
    end,
    endExclusive: next.toISOString().slice(0, 10),
    days,
    label: start === end ? format(start) : `${format(start)} – ${format(end)}`,
  };
}
export function queryPeriod(params: URLSearchParams): Period {
  const date = berlinToday();
  const monthEnd = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  return periodFor(
    params.get("start") || `${date.slice(0, 7)}-01`,
    params.get("end") || monthEnd.toISOString().slice(0, 10),
  );
}
export function presetPeriod(mode: string, value: string) {
  if (mode === "DAY") return periodFor(value, value);
  if (mode === "YEAR") return periodFor(`${value}-01-01`, `${value}-12-31`);
  const last = new Date(`${value}-01T00:00:00Z`);
  if (!Number.isFinite(last.getTime())) throw new Error("Geçerli ay seçin.");
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return periodFor(`${value}-01`, last.toISOString().slice(0, 10));
}
