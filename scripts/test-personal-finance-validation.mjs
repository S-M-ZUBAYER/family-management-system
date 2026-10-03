import assert from "node:assert/strict";
import test from "node:test";

import { financeAlertPercent, financeDate, financeMoney, financeMonthDate } from "../lib/personal-finance-validation.ts";

test("accepts real ISO calendar dates, including leap day", () => {
  assert.equal(financeDate("2024-02-29"), "2024-02-29");
  assert.equal(financeDate(" 2026-10-02 "), "2026-10-02");
  assert.equal(financeDate("2026-12-31"), "2026-12-31");
});

test("rejects malformed and impossible dates before a database write", () => {
  for (const value of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-00-01", "0000-01-01", "02/10/2026", 20261002]) {
    assert.equal(financeDate(value), undefined, String(value));
  }
});

test("optional dates may be blank but malformed values may not", () => {
  assert.equal(financeDate(null), null);
  assert.equal(financeDate("  "), null);
  assert.equal(financeDate("2026-1-2"), undefined);
});

test("budget months must be real zero-padded months", () => {
  assert.equal(financeMonthDate("2026-10"), "2026-10-01");
  for (const value of ["2026-00", "2026-13", "2026-1", "0000-01", "2026-01-01", null]) {
    assert.equal(financeMonthDate(value), null, String(value));
  }
});

test("money keeps at most two decimal places within numeric(14,2)", () => {
  assert.equal(financeMoney("12.34"), 12.34);
  assert.equal(financeMoney(-20.5), -20.5);
  assert.equal(financeMoney("999999999999.99"), 999999999999.99);
  assert.equal(financeMoney("", 0), 0);
  for (const value of ["0.001", "1e3", "0x10", "1000000000000", "01.20", 1.234, Infinity, {}, null]) {
    assert.equal(financeMoney(value), undefined, String(value));
  }
});

test("budget alert percentages are whole numbers, never rounded", () => {
  assert.equal(financeAlertPercent("80"), 80);
  assert.equal(financeAlertPercent(100), 100);
  assert.equal(financeAlertPercent(""), 80);
  for (const value of ["80.5", "0", "101", "1e2", -1, "abc"]) {
    assert.equal(financeAlertPercent(value), undefined, String(value));
  }
});
