import assert from "node:assert/strict";
import test from "node:test";

import { householdActionCopy } from "../lib/household-action-copy.ts";

test("household mutation dialogs identify the specific record in both languages", () => {
  const create = householdActionCopy({ action: "create_bill", data: {} }, "POST", "bn");
  assert.match(create.description, /ইউটিলিটি বিল রেকর্ড যোগ/);
  assert.match(create.successMessage, /ইউটিলিটি বিল রেকর্ড যোগ হয়েছে/);
  assert.equal(create.destructive, false);

  const edit = householdActionCopy({ kind: "task" }, "PATCH", "en");
  assert.match(edit.description, /shared task record/);
  assert.match(edit.successMessage, /Shared task record updated/);

  const remove = householdActionCopy({ kind: "contact" }, "DELETE", "bn");
  assert.match(remove.description, /সেবা যোগাযোগ রেকর্ড স্থায়ীভাবে মুছবেন/);
  assert.equal(remove.destructive, true);
});

test("status dialog names entity and target status", () => {
  const paid = householdActionCopy({ action: "update_status", data: { entity: "bill", status: "paid" } }, "POST", "bn");
  assert.match(paid.description, /ইউটিলিটি বিল রেকর্ডের স্ট্যাটাস “পরিশোধিত”/);
  assert.match(paid.successMessage, /“পরিশোধিত” করা হয়েছে/);

  const completed = householdActionCopy({ action: "update_status", data: { entity: "task", status: "completed" } }, "POST", "en");
  assert.match(completed.description, /shared task status to “completed”/);
});

test("unknown kinds and status values fall back to generic copy", () => {
  assert.equal(householdActionCopy({ action: "create_unknown" }, "POST", "bn"), null);
  assert.equal(householdActionCopy({ kind: "__proto__" }, "DELETE", "bn"), null);
  assert.equal(householdActionCopy({ action: "update_status", data: { entity: "bill", status: "__proto__" } }, "POST", "en"), null);
  assert.equal(householdActionCopy({ kind: "bill" }, "GET", "en"), null);
});
