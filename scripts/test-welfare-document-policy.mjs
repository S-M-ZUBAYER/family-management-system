import assert from "node:assert/strict";
import test from "node:test";

import { canDeleteWelfareDocument } from "../lib/welfare-document-policy.ts";

test("only draft contribution and expense evidence may be removed", () => {
  for (const kind of ["contribution", "expense"]) {
    assert.equal(canDeleteWelfareDocument(kind, "pending"), true);
    for (const status of ["approved", "paid", "refunded", "rejected", null]) {
      assert.equal(canDeleteWelfareDocument(kind, status), false);
    }
  }
});

test("request evidence is protected once review begins", () => {
  assert.equal(canDeleteWelfareDocument("request", "submitted"), true);
  for (const status of ["under_review", "approved", "disbursed", "cancelled", null]) {
    assert.equal(canDeleteWelfareDocument("request", status), false);
  }
});

test("closed fund documents cannot be removed", () => {
  assert.equal(canDeleteWelfareDocument("fund", "active"), true);
  assert.equal(canDeleteWelfareDocument("fund", "paused"), true);
  assert.equal(canDeleteWelfareDocument("fund", "closed"), false);
  assert.equal(canDeleteWelfareDocument("fund", null), false);
});
