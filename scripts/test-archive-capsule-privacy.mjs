import assert from "node:assert/strict";
import test from "node:test";

import { redactLockedCapsule } from "../lib/archive-capsule-privacy.ts";

test("future capsule messages are redacted without mutating the stored record", () => {
  const record = { title: "QA capsule", unlock_at: "2030-01-01T00:00:00.000Z", message: "synthetic secret" };
  const response = redactLockedCapsule(record, Date.parse("2026-10-04T00:00:00.000Z"));
  assert.equal(response.message, null);
  assert.equal(record.message, "synthetic secret");
  assert.equal(response.title, "QA capsule");
});

test("elapsed capsule messages remain available", () => {
  const response = redactLockedCapsule({ unlock_at: "2020-01-01T00:00:00.000Z", message: "public after unlock" }, Date.parse("2026-10-04T00:00:00.000Z"));
  assert.equal(response.message, "public after unlock");
});
