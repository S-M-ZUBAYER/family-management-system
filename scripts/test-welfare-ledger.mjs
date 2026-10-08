import assert from "node:assert/strict";
import test from "node:test";
import { welfareLedger } from "../lib/welfare-ledger.ts";
test("ledger keeps exact cents and excludes pending/rejected/refunded records", () => {
  const funds = [{ opening_balance: "0.10" }];
  const contributions = [{ amount: "0.20", status: "approved" }, ...["pending", "rejected", "refunded"].map(status => ({ amount: 99, status }))];
  const expenses = [{ amount: "0.15", status: "paid" }, ...["pending", "approved", "rejected"].map(status => ({ amount: 99, status }))];
  const pledges = [{ amount: "0.10", status: "active", is_mine: true }, { amount: "0.20", status: "active", is_mine: true }, { amount: 99, status: "paused", is_mine: true }, { amount: 99, status: "active", is_mine: false }];
  assert.deepEqual(welfareLedger(funds, contributions, expenses, pledges), { openingBalance: 0.1, approvedIncome: 0.2, paidExpense: 0.15, balance: 0.15, myPledge: 0.3 });
});
test("disbursement's linked paid expense reduces balance exactly once", () => {
  // Requests themselves are not an expense input and cannot be double-counted.
  assert.equal(welfareLedger([{ opening_balance: 10 }], [], [{ amount: "3.25", status: "paid", linked_request_id: "qa" }]).balance, 6.75);
  assert.equal(welfareLedger([], [], []).balance, 0);
});
test("invalid or precision-overflow totals fail rather than showing zero", () => {
  assert.throws(() => welfareLedger([{ opening_balance: "bad" }], [], []), RangeError);
  assert.throws(() => welfareLedger(Array.from({length: 100}, () => ({ opening_balance: "999999999999.99" })), [], []), RangeError);
});
