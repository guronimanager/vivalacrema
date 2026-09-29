import test from "node:test";
import assert from "node:assert/strict";
import {
  sumMoney,
  csvText,
  money,
  revenueReconciliation,
} from "../src/lib/finance.ts";
import {
  optionalDate,
  amount,
  flag,
  text,
  readInput,
  InputError,
} from "../src/lib/record-input.ts";

test("cent totals reconcile decimals and refunds without display artifacts", () => {
  assert.equal(sumMoney([0.1, 0.2, 115.02]), 115.32);
  assert.equal(sumMoney([10.25, -10.25]), 0);
  assert.ok(money(115.02000000000001).includes("115,02"));
});

test("monthly/daily revenue differences are exposed without altering the source totals", () => {
  assert.deepEqual(
    revenueReconciliation(100, [{ revenue: 40.01 }, { revenue: 50.02 }]),
    { dailyTotal: 90.03, difference: 9.97 },
  );
  assert.deepEqual(
    revenueReconciliation(0.3, [{ revenue: 0.1 }, { revenue: 0.2 }]),
    { dailyTotal: 0.3, difference: 0 },
  );
});

test("calendar validation rejects rollover dates and accepts leap days", () => {
  assert.equal(
    optionalDate({ date: "2024-02-29" }, "date").toISOString().slice(0, 10),
    "2024-02-29",
  );
  assert.throws(() => optionalDate({ date: "2026-02-29" }, "date"), InputError);
  assert.throws(() => optionalDate({ date: "2026-13-01" }, "date"), InputError);
  assert.equal(optionalDate({ date: "" }, "date"), null);
});

test("invalid money and state values fail validation before any persistence", () => {
  for (const value of [-1, "Infinity", "", "  ", null, true])
    assert.throws(() => amount({ amount: value }, "amount"), InputError);
  assert.equal(
    amount({ amount: "115.02000000000001" }, "amount").toFixed(2),
    "115.02",
  );
  assert.throws(() => flag({ paid: "false" }, "paid", false), InputError);
  assert.throws(() => text({ name: "   " }, "name", true), InputError);
});

test("malformed request bodies are rejected", async () => {
  for (const body of ["[]", "null", "{broken"])
    await assert.rejects(
      readInput(new Request("http://localhost", { method: "POST", body })),
      InputError,
    );
});

test("CSV keeps quoted Turkish text, negative amounts and blocks spreadsheet formulas", () => {
  const csv = csvText([
    ["Kategori", "Tutar"],
    ['=HYPERLINK("x")', "-12.25"],
    ['Süt; "tam"\nmalzeme', 15],
    ["\t@SUM(1)", 2],
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"-12.25"'));
  assert.ok(csv.includes('Süt; ""tam""\nmalzeme'));
  assert.ok(csv.includes(`"'\t@SUM(1)"`));
});
