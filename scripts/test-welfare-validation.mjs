import assert from "node:assert/strict";
import test from "node:test";
import { validateWelfareRecord, validateWelfareStatus, isWelfareKind } from "../lib/welfare-validation.ts";
import { welfareErrorCopy } from "../lib/welfare-error-copy.ts";
const fundId = "20000000-0000-4000-8000-000000000002", today = "2026-10-08";
const base = { fund: {}, contribution: { fundId, amount: "1.25" }, expense: { fundId, amount: "1.25" }, request: { requestedAmount: "1.25" }, pledge: { fundId, amount: "1.25" } };
const check = (kind, extra) => validateWelfareRecord(kind, { ...base[kind], ...extra }, today);
test("money never coerces booleans, rounds cents or exceeds numeric(14,2)", () => {
  for (const kind of Object.keys(base)) for (const value of [true, [], {}, "1e2", "0x10", "1.001", -1, "1000000000000"]) {
    const key = kind === "fund" ? "targetAmount" : kind === "request" ? "requestedAmount" : "amount";
    assert.equal(check(kind, { [key]: value }).code, "WELFARE_INVALID_MONEY", `${kind} ${String(value)}`);
  }
  assert.equal(check("fund", {}).data.openingBalance, 0);
  assert.equal(check("expense", { amount: "999999999999.99" }).data.amount, 999999999999.99);
  for (const kind of ["contribution", "expense", "request", "pledge"]) assert.equal(check(kind, { [kind === "request" ? "requestedAmount" : "amount"]: 0 }).code, "WELFARE_INVALID_MONEY");
});
test("dates are calendar-checked with optional defaults only when omitted", () => {
  for (const [kind,key] of [["contribution","contributionDate"], ["expense","expenseDate"], ["pledge","startDate"]]) {
    assert.equal(check(kind, {}).data[key], today);
    assert.equal(check(kind, { [key]: "2024-02-29" }).data[key], "2024-02-29");
    for (const value of ["", null, true, "2026-02-30", "2026-10-08 extra", "2026-1-1"]) assert.equal(check(kind, { [key]: value }).code, "WELFARE_INVALID_DATE");
  }
  assert.equal(check("pledge", { nextDueDate: "" }).data.nextDueDate, null);
  assert.equal(check("pledge", { nextDueDate: "2026-10-07" }).code, "WELFARE_INVALID_DATE");
  assert.equal(check("pledge", { nextDueDate: "bad" }).code, "WELFARE_INVALID_DATE");
});
test("all enumerations reject explicit invalid values instead of choosing a fallback", () => {
  for (const [kind,key] of [["fund","category"], ["fund","visibility"], ["contribution","paymentMethod"], ["expense","category"], ["expense","paymentMethod"], ["request","requestType"], ["request","urgency"], ["request","visibility"], ["pledge","frequency"]]) {
    for (const value of ["constructor", null, true, "invalid"]) assert.equal(check(kind, { [key]: value }).code, "WELFARE_INVALID_OPTION");
  }
});
test("body and linked IDs fail closed", () => {
  for (const value of [null, [], true, "text"]) assert.equal(validateWelfareRecord("fund", value, today).code, "WELFARE_INVALID_BODY");
  for (const value of ["bad", `${fundId}garbage`, true, []]) assert.equal(check("request", { fundId: value }).code, "WELFARE_INVALID_RECORD");
  assert.equal(check("request", { fundId: "" }).data.fundId, null);
  for (const kind of ["constructor", "__proto__", "bogus"]) assert.equal(isWelfareKind(kind), false);
});
test("statuses never fall back to fund and approval/payment values are strict", () => {
  const base = { entity: "request", id: fundId, status: "approved", approvedAmount: "1.25" };
  assert.equal(validateWelfareStatus(base).data.entity, "request");
  for (const extra of [{ entity: "bogus" }, { entity: "constructor" }, { id: `${fundId}junk` }]) assert.equal(validateWelfareStatus({ ...base, ...extra }).code, "WELFARE_INVALID_RECORD");
  for (const approvedAmount of [true, "", null, "1.001", "1e2", -1]) assert.equal(validateWelfareStatus({ ...base, approvedAmount }).code, "WELFARE_INVALID_MONEY");
  assert.equal(validateWelfareStatus({ ...base, paymentMethod: "invalid" }).code, "WELFARE_INVALID_OPTION");
  assert.equal(validateWelfareStatus({ ...base, status: "active" }).code, "WELFARE_INVALID_OPTION");
});
test("validation and outflow errors have both language copies with safe unknown fallback", () => {
  for (const code of ["WELFARE_INVALID_MONEY", "WELFARE_INVALID_DATE", "WELFARE_INVALID_TRANSITION", "WELFARE_RECORD_CHANGED", "WELFARE_INSUFFICIENT_BALANCE"]) for (const locale of ["bn","en"]) assert.ok(welfareErrorCopy(code, locale));
  assert.equal(welfareErrorCopy("constructor", "en"), null);
});
