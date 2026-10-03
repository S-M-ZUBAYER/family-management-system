import assert from "node:assert/strict";
import test from "node:test";

import { qurbaniAutoAmountDue, qurbaniDate, qurbaniIsoToLocalDateTime, qurbaniLocalDateTimeToIso, qurbaniMoney, qurbaniPositiveInteger, qurbaniShares, qurbaniTimestamp, qurbaniWeight } from "../lib/qurbani-validation.ts";

test("Qurbani money and measured amounts never silently round or overflow", () => {
  assert.equal(qurbaniMoney("999999999999.99"), 999999999999.99);
  assert.equal(qurbaniShares("1.25"), 1.25);
  assert.equal(qurbaniWeight("0.01"), 0.01);
  assert.equal(qurbaniMoney("", 0), 0);
  for (const value of ["1.001", "1e3", "0x10", "1000000000000", "01.2", -1, Infinity, {}]) {
    assert.equal(qurbaniMoney(value), undefined, String(value));
  }
  assert.equal(qurbaniShares("100000000"), undefined);
  assert.equal(qurbaniWeight("10000000000"), undefined);
});

test("sequence and package counts must be positive PostgreSQL integers", () => {
  assert.equal(qurbaniPositiveInteger("12"), 12);
  assert.equal(qurbaniPositiveInteger("", 1), 1);
  for (const value of ["1.5", "0", "01", "2147483648", "1e2", -1]) {
    assert.equal(qurbaniPositiveInteger(value), undefined, String(value));
  }
});

test("automatic amount due uses exact hundredths and explicit cent rounding", () => {
  assert.equal(qurbaniAutoAmountDue(1.25, "120.40"), 150.5);
  assert.equal(qurbaniAutoAmountDue(0.5, "0.01"), 0.01);
  assert.equal(qurbaniAutoAmountDue(0.25, "0.01"), 0);
  assert.equal(qurbaniAutoAmountDue(100, "999999999999.99"), undefined);
});

test("Qurbani dates reject impossible and ambiguous values", () => {
  assert.equal(qurbaniDate("2024-02-29"), "2024-02-29");
  assert.equal(qurbaniDate(""), null);
  for (const value of ["2025-02-29", "2026-13-01", "0000-01-01", "10/02/2026", 20261002]) {
    assert.equal(qurbaniDate(value), undefined, String(value));
  }
  assert.equal(qurbaniTimestamp("2026-10-02T09:30:00+06:00"), "2026-10-02T03:30:00.000Z");
  for (const value of ["2026-10-02T09:30", "2025-02-29T09:30Z", "2026-10-02T25:30Z", "2026-10-02T09:30+14:30"]) {
    assert.equal(qurbaniTimestamp(value), undefined, String(value));
  }
});

test("browser-local date times round trip without a UTC edit-time shift", () => {
  const local = "2026-10-02T09:30";
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = "Asia/Dhaka";
    const iso = qurbaniLocalDateTimeToIso(local);
    assert.equal(iso, "2026-10-02T03:30:00.000Z");
    assert.equal(qurbaniIsoToLocalDateTime(iso), local);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
  assert.equal(qurbaniLocalDateTimeToIso("2026-02-30T09:30"), undefined);
  assert.equal(qurbaniLocalDateTimeToIso(""), null);
});
