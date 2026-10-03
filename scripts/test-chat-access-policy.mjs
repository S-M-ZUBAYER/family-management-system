import assert from "node:assert/strict";
import test from "node:test";

import { canAccessChatChannel } from "../lib/chat-access-policy.ts";

test("a stale channel-member row never grants admin-only chat access after demotion", () => {
  assert.equal(canAccessChatChannel("admins", "member", true), false);
  for (const role of ["owner", "family_admin", "manager"]) {
    assert.equal(canAccessChatChannel("admins", role, false), true);
  }
});

test("family and invitation-only channels keep their intended access rules", () => {
  assert.equal(canAccessChatChannel("family", "member", false), true);
  assert.equal(canAccessChatChannel("invite_only", "owner", false), false);
  assert.equal(canAccessChatChannel("invite_only", "member", true), true);
});
