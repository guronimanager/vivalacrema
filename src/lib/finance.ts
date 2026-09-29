export function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("tr-TR", { timeZone: "UTC" });
}

export function sumMoney(values: number[]) {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}

export function csvText(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value);
            if (
              typeof value === "string" &&
              !/^-?\d+(\.\d+)?$/.test(text) &&
              /^[\s]*[=+@-]/.test(text)
            )
              text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}

export function revenueReconciliation(
  revenue: number,
  daily: { revenue: number }[],
) {
  const dailyTotal = sumMoney(daily.map((day) => day.revenue));
  const difference = sumMoney([revenue, -dailyTotal]);
  return { dailyTotal, difference };
}
