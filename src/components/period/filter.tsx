"use client";
import { useState } from "react";
import {
  berlinToday,
  presetPeriod,
  periodFor,
  type Period,
} from "@/lib/period";
import {
  Field,
  inputClass,
  buttonClass,
  Notice,
} from "@/components/finance/ui";
export function PeriodFilter({
  onChange,
  initial,
}: {
  onChange: (period: Period) => void;
  initial?: Period;
}) {
  const [mode, setMode] = useState("MONTH"),
    [value, setValue] = useState(() => berlinToday().slice(0, 7));
  const [start, setStart] = useState(
      initial?.start || `${berlinToday().slice(0, 7)}-01`,
    ),
    [end, setEnd] = useState(initial?.end || berlinToday()),
    [error, setError] = useState("");
  return (
    <form
      className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const period =
            mode === "RANGE"
              ? periodFor(start, end)
              : presetPeriod(mode, value);
          setError("");
          onChange(period);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Dönem türü">
          <select
            className={inputClass}
            value={mode}
            onChange={(e) => {
              const next = e.target.value;
              setMode(next);
              setValue(
                next === "YEAR"
                  ? berlinToday().slice(0, 4)
                  : next === "DAY"
                    ? berlinToday()
                    : berlinToday().slice(0, 7),
              );
            }}
          >
            <option value="MONTH">Ay</option>
            <option value="DAY">Gün</option>
            <option value="YEAR">Yıl</option>
            <option value="RANGE">Belirli süre</option>
          </select>
        </Field>
        {mode === "RANGE" ? (
          <>
            <Field label="Başlangıç">
              <input
                className={inputClass}
                required
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Bitiş">
              <input
                className={inputClass}
                required
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field
            label={mode === "MONTH" ? "Ay" : mode === "DAY" ? "Gün" : "Yıl"}
          >
            <input
              className={inputClass}
              required
              type={
                mode === "MONTH" ? "month" : mode === "DAY" ? "date" : "number"
              }
              min={mode === "YEAR" ? "2000" : undefined}
              max={mode === "YEAR" ? "2100" : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        )}
        <button className={buttonClass}>Dönemi uygula</button>
      </div>
      <Notice error={error} />
    </form>
  );
}
