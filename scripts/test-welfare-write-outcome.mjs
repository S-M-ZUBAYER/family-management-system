import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { welfareWrite, welfareRecordFeedback, WelfareWriteOutcomeUnknownError } from "../lib/welfare-write-outcome.ts";
import { welfareErrorCopy } from "../lib/welfare-error-copy.ts";
const confirmedRejected = e => e?.rejected === true;
test("confirmed create/edit/delete/status write is audited once after persistence", async () => {
  for (const operation of ["create", "edit", "delete", "status"]) {
    const calls = [], value = { id: "QA-only", operation };
    const result = await welfareWrite({ write: async () => { calls.push("write"); return value; }, valid: v => v.id === value.id, audit: async v => { assert.equal(v, value); calls.push("audit"); }, confirmedRejected });
    assert.equal(result.value, value); assert.equal(result.auditPending, false); assert.deepEqual(calls, ["write", "audit"]);
  }
});
test("audit outage preserves confirmed writes and reports pending rather than retrying or compensating", async () => {
  let writes = 0, audits = 0;
  const result = await welfareWrite({ write: async () => { writes++; return [{ id: "QA-only" }]; }, valid: v => v.length === 1, audit: async () => { audits++; throw new Error("simulated audit outage"); }, confirmedRejected });
  assert.equal(result.auditPending, true); assert.equal(result.value[0].id, "QA-only"); assert.equal(writes, 1); assert.equal(audits, 1);
});
test("confirmed backend rejection propagates unchanged, without an audit", async () => {
  const error = { rejected: true }; let audits = 0;
  await assert.rejects(welfareWrite({ write: async () => { throw error; }, valid: () => true, audit: async () => { audits++; }, confirmedRejected }), e => e === error);
  assert.equal(audits, 0);
});
test("lost response becomes an uncertain outcome, with no audit, retry or compensation", async () => {
  let writes = 0, audits = 0;
  await assert.rejects(welfareWrite({ write: async () => { writes++; throw new TypeError("response lost after save"); }, valid: () => true, audit: async () => { audits++; }, confirmedRejected }), WelfareWriteOutcomeUnknownError);
  assert.equal(writes, 1); assert.equal(audits, 0);
});
test("empty create or malformed financial RPC result is not falsely accepted", async () => {
  for (const value of [undefined, null, [], {}, { id: "wrong", status: "paid" }]) {
    let audits = 0;
    await assert.rejects(welfareWrite({ write: async () => value, valid: v => Boolean(v?.id === "QA-only" && v.status === "paid"), audit: async () => { audits++; }, confirmedRejected }), WelfareWriteOutcomeUnknownError);
    assert.equal(audits, 0);
  }
});
test("compare-and-set empty match is a known no-change, without audit", async () => {
  let audits = 0;
  const result = await welfareWrite({ write: async () => [], valid: Array.isArray, audit: async rows => { if (rows.length) audits++; }, confirmedRejected });
  assert.deepEqual(result.value, []); assert.equal(result.auditPending, false); assert.equal(audits, 0);
});
test("atomic outflow invokes its RPC once without a second REST audit", async () => {
  let writes = 0;
  const result = await welfareWrite({ write: async () => { writes++; return { id: "QA-only", status: "disbursed" }; }, valid: v => v.id === "QA-only" && v.status === "disbursed", confirmedRejected });
  assert.equal(writes, 1); assert.equal(result.auditPending, false);
});
test("pending and unknown outcomes use specific bilingual info; unrelated errors do not become success", () => {
  for (const locale of ["bn", "en"]) {
    const pending = welfareRecordFeedback(202, { auditPending: true }, locale);
    const unknown = welfareRecordFeedback(503, { outcomeUnknown: true, code: "WELFARE_WRITE_OUTCOME_UNKNOWN" }, locale);
    assert.equal(pending.kind, "info"); assert.equal(unknown.kind, "info"); assert.equal(unknown.message, welfareErrorCopy("WELFARE_WRITE_OUTCOME_UNKNOWN", locale));
    assert.match(pending.message, locale === "en" ? /do not submit.*again/i : /আবার পাঠাবেন না/);
    assert.match(unknown.message, locale === "en" ? /Do not submit.*again/i : /আবার পাঠাবেন না/);
    assert.equal(welfareRecordFeedback(200, {}, locale), null); assert.equal(welfareRecordFeedback(500, { outcomeUnknown: true }, locale), null);
    assert.equal(welfareRecordFeedback(503, { outcomeUnknown: true, code: "WRONG" }, locale), null);
  }
});
test("route/client wiring covers all mutations, retains scoped audits and avoids a second 202 success", () => {
  const route = readFileSync(new URL("../app/api/welfare/records/route.ts", import.meta.url), "utf8");
  assert.equal((route.match(/await welfareWrite\(/g) ?? []).length, 5);
  assert.ok(route.includes("error.status !== 408")); assert.ok(route.includes("family_id: `eq.${membership.family_id}`"));
  const center = readFileSync(new URL("../app/welfare-center.tsx", import.meta.url), "utf8");
  assert.ok(center.includes("responseStatus !== 202")); assert.equal((center.match(/response.status !== 202/g) ?? []).length, 4);
  const provider = readFileSync(new URL("../components/action-modal-provider.tsx", import.meta.url), "utf8");
  assert.ok(provider.includes('url.pathname === "/api/welfare/records"')); assert.ok(provider.includes("welfareRecordFeedback(response.status, welfarePayload, locale)"));
  assert.ok(provider.includes('const welfareFailure = url.pathname === "/api/welfare/records"'));
  assert.ok(provider.includes("throw propagatedError;"));
});
