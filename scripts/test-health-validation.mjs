import assert from "node:assert/strict";
import test from "node:test";
import { healthDate, healthDecimal, healthLocalInputToIso, healthNumber, healthReminderMinutes, healthReminderTimes, healthTimestamp, healthUuid } from "../lib/health-validation.ts";

test("invalid optional dates/timestamps are not silently replaced with now", () => {
  assert.equal(healthDate("2026-02-30"), undefined);
  assert.equal(healthTimestamp("2026-02-30T08:00:00Z"), undefined);
  assert.equal(healthTimestamp("invalid"), undefined);
  assert.equal(healthTimestamp("2026-10-08T08:00"), undefined);
  assert.equal(healthTimestamp("2026-10-08T08:00:00+06:00"), "2026-10-08T02:00:00.000Z");
  assert.equal(healthTimestamp(""), null);
});
test("appointment reminders use integer minutes, invalid values never become 60", () => {
  assert.equal(healthReminderMinutes(""), 60);
  assert.equal(healthReminderMinutes("0"), 0);
  assert.equal(healthReminderMinutes(10080), 10080);
  for (const value of ["bad", true, [], 1.5, -1, 10081]) assert.equal(healthReminderMinutes(value), undefined);
});
test("all medication reminder times must be valid instead of being silently discarded", () => {
  assert.deepEqual(healthReminderTimes(["08:00", "20:00", "08:00"]), ["08:00", "20:00"]);
  for (const value of [["25:00"], ["08:00", "bad"], "08:00", Array(13).fill("08:00")]) assert.equal(healthReminderTimes(value), undefined);
});
test("measurement numbers reject type coercion, fractional precision loss and overflow", () => {
  assert.equal(healthDecimal("98.25"), 98.25);
  for (const value of [true, [], {}, "0x10", "NaN", "0.001", "100000000"]) assert.equal(healthDecimal(value), undefined);
  assert.equal(healthNumber(0), 0);
  assert.equal(healthDecimal(""), null);
  assert.equal(healthUuid("-".repeat(36)), null);
  assert.ok(healthUuid("20000000-0000-4000-8000-000000000002"));
});
test("browser local datetime preserves the selected instant in Dhaka and UTC", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "Asia/Dhaka";
    assert.equal(healthLocalInputToIso("2026-10-08T08:00"), "2026-10-08T02:00:00.000Z");
    process.env.TZ = "UTC";
    assert.equal(healthLocalInputToIso("2026-10-08T08:00"), "2026-10-08T08:00:00.000Z");
    assert.throws(() => healthLocalInputToIso("2026-02-30T08:00"));
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
