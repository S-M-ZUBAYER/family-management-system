import assert from "node:assert/strict";
import test from "node:test";

import { welfareActionCopy } from "../lib/welfare-action-copy.ts";

test("Welfare record confirmation and result identify the entity", () => {
  const created = welfareActionCopy({ action: "create_pledge", data: {} }, "POST", "bn");
  assert.match(created.description, /অঙ্গীকার রেকর্ড যোগ/);
  assert.match(created.successMessage, /অঙ্গীকার রেকর্ড যোগ হয়েছে/);
  const edited = welfareActionCopy({ kind: "pledge" }, "PATCH", "en");
  assert.match(edited.description, /pledge record/);
  assert.match(edited.successMessage, /Pledge record updated/);
  const removed = welfareActionCopy({ kind: "request" }, "DELETE", "en");
  assert.match(removed.description, /Permanently delete this assistance request/);
  assert.equal(removed.destructive, true);
});

test("Welfare statuses name the target and warn for financial finality", () => {
  const paused = welfareActionCopy({ action: "update_status", data: { entity: "pledge", status: "paused" } }, "POST", "en");
  assert.match(paused.description, /pledge status to “paused”/);
  assert.equal(paused.destructive, false);
  const paid = welfareActionCopy({ action: "update_status", data: { entity: "expense", status: "paid" } }, "POST", "bn");
  assert.match(paid.description, /ব্যয় রেকর্ডের স্ট্যাটাস “পরিশোধিত”/);
  assert.match(paid.description, /হিসাবের ইতিহাস সংরক্ষিত থাকবে/);
  assert.equal(paid.destructive, true);
});

test("unknown Welfare actions fall back to generic copy", () => {
  assert.equal(welfareActionCopy({ action: "create_unknown" }, "POST", "bn"), null);
  assert.equal(welfareActionCopy({ kind: "__proto__" }, "DELETE", "en"), null);
  assert.equal(welfareActionCopy({ action: "update_status", data: { entity: "fund", status: "bogus" } }, "POST", "en"), null);
  assert.equal(welfareActionCopy({ kind: "pledge" }, "GET", "en"), null);
});
