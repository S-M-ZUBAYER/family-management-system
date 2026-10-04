import assert from "node:assert/strict";
import test from "node:test";

import { memberActionCopy, memberActionResult } from "../lib/member-action-copy.ts";

test("Directory profile actions identify the record and membership boundary", () => {
  const created = memberActionCopy("/api/members", "POST", { nameBn: "পরীক্ষা সদস্য", nameEn: "QA Member" }, "en");
  assert.match(created.description, /QA Member/);
  assert.match(created.description, /does not approve/);
  const updated = memberActionCopy("/api/members", "PATCH", { action: "update_profile", data: { nameBn: "পরীক্ষা সদস্য" } }, "bn");
  assert.match(updated.description, /পরীক্ষা সদস্য/);
  assert.equal(updated.destructive, false);
});

test("Relationship removal distinguishes a connection from member profiles", () => {
  for (const locale of ["bn", "en"]) {
    const removed = memberActionCopy("/api/members", "PATCH", { action: "delete_relationship" }, locale);
    assert.equal(removed.destructive, true);
    assert.match(removed.description, locale === "bn" ? /প্রোফাইল মুছে যাবে না/ : /profile will be deleted/);
  }
});

test("Profile photo upload explains family visibility in both languages", () => {
  assert.match(memberActionCopy("/api/members/photo", "POST", {}, "en").description, /directory access/);
  assert.match(memberActionCopy("/api/members/photo", "POST", {}, "bn").description, /ডিরেক্টরি-অ্যাক্সেস/);
  assert.equal(memberActionCopy("/api/members", "GET", {}, "en"), null);
});

test("Partial profile creation and duplicate relationships do not report completed success", () => {
  const partial = memberActionResult("/api/members", "POST", { nameBn: "পরীক্ষা" }, { warning: "relationship failed" }, "en", "Member profile added.", 201);
  assert.equal(partial.status, 202);
  assert.match(partial.message, /not created/);
  const duplicate = memberActionResult("/api/members", "PATCH", { action: "create_relationship" }, { relationship: null }, "bn", "যোগ হয়েছে", 200);
  assert.equal(duplicate.status, 202);
  assert.equal(duplicate.noChange, true);
  assert.match(duplicate.message, /আগে থেকেই আছে/);
  const saved = memberActionResult("/api/members", "PATCH", { action: "create_relationship" }, { relationship: { id: "test" } }, "en", "Family connection added.", 200);
  assert.deepEqual(saved, { status: 200, noChange: false, message: "Family connection added." });
});
