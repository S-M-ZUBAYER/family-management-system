import assert from "node:assert/strict";
import test from "node:test";
import { financeErrorCopy, financeRecordActionCopy, financeStatusActionCopy } from "../lib/finance-action-copy.ts";
test("all six record confirmations distinguish create, edit and permanent delete", () => {
  for (const kind of ["account", "transaction", "budget", "debt", "bill", "goal"]) for (const locale of ["bn", "en"]) {
    assert.ok(financeRecordActionCopy(kind, "POST", locale));
    assert.equal(financeRecordActionCopy(kind, "PATCH", locale).destructive, false);
    assert.equal(financeRecordActionCopy(kind, "DELETE", locale).destructive, true);
  }
  assert.match(financeRecordActionCopy("budget", "PATCH", "en").description, /monthly budget/);
  assert.match(financeRecordActionCopy("debt", "DELETE", "bn").description, /ফিরিয়ে আনা যাবে না/);
});
test("status/progress describe total replacement and no real payment", () => {
  assert.match(financeStatusActionCopy({ entity: "debt", amount: "20" }, "PATCH", "en").description, /replaces the previous total; no money/);
  assert.match(financeStatusActionCopy({ entity: "goal", amount: "20" }, "PATCH", "bn").description, /মোট সঞ্চিত/);
  assert.match(financeStatusActionCopy({ entity: "bill", status: "paid" }, "PATCH", "en").description, /No money will be transferred/);
});
test("unknown and prototype record/status values do not claim supported actions", () => {
  assert.equal(financeRecordActionCopy("__proto__", "POST", "en"), null);
  assert.equal(financeRecordActionCopy("account", "GET", "en"), null);
  assert.equal(financeStatusActionCopy({ entity: "account", status: "__proto__" }, "PATCH", "en"), null);
  assert.equal(financeStatusActionCopy({ entity: "unknown", status: "paid" }, "PATCH", "en"), null);
});
test("duplicate budget conflicts have actionable BN/EN copy without database details", () => {
  assert.match(financeErrorCopy("FINANCE_DUPLICATE_BUDGET", "en"), /Edit the existing budget/);
  assert.match(financeErrorCopy("FINANCE_DUPLICATE_BUDGET", "bn"), /বিদ্যমান বাজেট সম্পাদনা/);
  assert.equal(financeErrorCopy("unknown", "en"), null);
  assert.match(financeErrorCopy("FINANCE_DEBT_OVERPAYMENT", "en"), /cannot exceed/);
  assert.match(financeErrorCopy("FINANCE_DEBT_OVERPAYMENT", "bn"), /বেশি হতে পারে না/);
});
