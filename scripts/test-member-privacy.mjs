import assert from "node:assert/strict";
import test from "node:test";

import { canViewDirectoryProfile, visibleDirectoryMembers } from "../lib/member-privacy.ts";

const members = [
  { id: "own", auth_user_id: "viewer", email: "own@example.com", phone: "100" },
  { id: "open", auth_user_id: "open-user", email: "open@example.com", phone: "200" },
  { id: "admins", auth_user_id: "admin-only-user", email: "admins@example.com", phone: "300" },
  { id: "hidden", auth_user_id: "hidden-user", email: "hidden@example.com", phone: "400" },
  { id: "unset", auth_user_id: "unset-user", email: "unset@example.com", phone: "500" },
  { id: "unlinked", auth_user_id: null, email: "unlinked@example.com", phone: "600" },
];

const consents = [
  { user_id: "open-user", directory_visibility: "family", show_email_to_family: true, show_phone_to_family: false },
  { user_id: "admin-only-user", directory_visibility: "admins_only", show_email_to_family: true, show_phone_to_family: true },
  { user_id: "hidden-user", directory_visibility: "hidden", show_email_to_family: true, show_phone_to_family: true },
];

test("ordinary members see only permitted directory profiles and contact fields", () => {
  const visible = visibleDirectoryMembers(members, consents, "viewer", false);
  assert.deepEqual(visible.map((member) => member.id), ["own", "open", "unset", "unlinked"]);
  assert.deepEqual(visible.map(({ email, phone }) => [email, phone]), [
    ["own@example.com", "100"],
    ["open@example.com", null],
    [null, null],
    [null, null],
  ]);
});

test("administrators retain full profile access for family administration", () => {
  const visible = visibleDirectoryMembers(members, consents, "viewer", true);
  assert.deepEqual(visible, members);
});

test("a member can always view their own hidden profile", () => {
  const visible = visibleDirectoryMembers(members, consents, "hidden-user", false);
  assert.equal(visible.find((member) => member.id === "hidden")?.phone, "400");
  assert.equal(visible.some((member) => member.id === "admins"), false);
});

test("direct profile image access follows the same visibility rule", () => {
  assert.equal(canViewDirectoryProfile("hidden-user", "hidden", "viewer", false), false);
  assert.equal(canViewDirectoryProfile("admin-only-user", "admins_only", "viewer", false), false);
  assert.equal(canViewDirectoryProfile("hidden-user", "hidden", "hidden-user", false), true);
  assert.equal(canViewDirectoryProfile("hidden-user", "hidden", "admin", true), true);
  assert.equal(canViewDirectoryProfile("unset-user", undefined, "viewer", false), true);
});
