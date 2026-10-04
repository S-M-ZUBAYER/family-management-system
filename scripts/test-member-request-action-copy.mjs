import assert from "node:assert/strict";
import test from "node:test";

import { memberRequestActionCopy } from "../lib/member-request-action-copy.ts";

test("approval copy explains that membership grants family access", () => {
  for (const locale of ["bn", "en"]) {
    const copy = memberRequestActionCopy("/api/member-requests/123", "PATCH", { decision: "approve" }, locale);
    assert.equal(copy.destructive, false);
    assert.match(copy.description, locale === "bn" ? /প্রবেশাধিকার|access/ : /access/);
    assert.ok(copy.confirmLabel);
    assert.ok(copy.successMessage);
  }
});

test("rejection copy warns that the written reason is visible to applicant", () => {
  for (const locale of ["bn", "en"]) {
    const copy = memberRequestActionCopy("/api/member-requests/123", "PATCH", { decision: "reject" }, locale);
    assert.equal(copy.destructive, true);
    assert.match(copy.description, locale === "bn" ? /কারণটি আবেদনকারীকে/ : /reason will be shown/);
  }
});

test("unrelated and unsupported operations use their own confirmation handling", () => {
  assert.equal(memberRequestActionCopy("/api/member-requests", "POST", { decision: "approve" }, "en"), null);
  assert.equal(memberRequestActionCopy("/api/member-requests/123", "GET", {}, "en"), null);
  assert.equal(memberRequestActionCopy("/api/member-requests/123", "PATCH", { decision: "unknown" }, "en"), null);
});
