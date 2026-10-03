import assert from "node:assert/strict";
import test from "node:test";

import { canMutateArchiveRecord } from "../lib/archive-access.ts";

test("private archive records are mutable only by their owner", () => {
  assert.equal(canMutateArchiveRecord("private", "member-a", "manager-b", true), false);
  assert.equal(canMutateArchiveRecord("private", "member-a", "member-b", false), false);
  assert.equal(canMutateArchiveRecord("private", "member-a", "member-a", false), true);
  assert.equal(canMutateArchiveRecord("private", "member-a", "member-a", true), true);
});

test("ordinary manager permissions remain for family and admin archives", () => {
  assert.equal(canMutateArchiveRecord("family", "member-a", "manager-b", true), true);
  assert.equal(canMutateArchiveRecord("admins", "member-a", "manager-b", true), true);
  assert.equal(canMutateArchiveRecord("family", "member-a", "member-b", false), false);
});
