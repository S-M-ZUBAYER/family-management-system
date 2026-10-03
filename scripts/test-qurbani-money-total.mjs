import assert from "node:assert/strict";
import test from "node:test";

import { qurbaniMoneyOutstanding, qurbaniMoneyTotal } from "../lib/qurbani-money-total.ts";

test("Qurbani workbook and dashboard money totals retain exact cents", () => {
  assert.equal(qurbaniMoneyTotal(["0.10", "0.20"]), 0.3);
  assert.equal(qurbaniMoneyTotal(["12.40", "0.01", null]), 12.41);
  assert.equal(qurbaniMoneyTotal([0.3, -0.1, -0.2]), 0);
  assert.equal(qurbaniMoneyOutstanding("0.30", "0.10"), 0.2);
  assert.equal(qurbaniMoneyOutstanding("0.10", "0.30"), 0);
});

test("Qurbani totals reject invalid or unrepresentable XLSX amounts", () => {
  assert.throws(() => qurbaniMoneyTotal(["1.001"]), RangeError);
  assert.throws(() => qurbaniMoneyTotal(["90071992547409.92"]), RangeError);
});
