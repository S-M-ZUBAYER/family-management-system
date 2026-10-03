import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVE_FAMILY_COOKIE, activeFamilyCookieHeader, activeFamilyMembershipQuery, familyCreationSlug, selectedFamilyIdFromCookie, validFamilyId } from "../lib/family-selection.ts";

const familyId = "123e4567-e89b-42d3-a456-426614174000";

test("accepts a valid family UUID from its own cookie", () => {
  assert.equal(validFamilyId(familyId), true);
  assert.equal(selectedFamilyIdFromCookie(`other=x; ${ACTIVE_FAMILY_COOKIE}=${familyId}; another=y`), familyId);
});

test("ignores absent or malformed family selections", () => {
  for (const value of [null, "", "other=x", `${ACTIVE_FAMILY_COOKIE}=not-a-uuid`, `${ACTIVE_FAMILY_COOKIE}=123e4567-e89b-02d3-a456-426614174000`]) {
    assert.equal(selectedFamilyIdFromCookie(value), null);
  }
  assert.equal(validFamilyId({}), false);
});

test("does not accept a similarly named cookie", () => {
  assert.equal(selectedFamilyIdFromCookie(`${ACTIVE_FAMILY_COOKIE}_old=${familyId}`), null);
});

test("creation keys map to one stable slug without trusting a family name", () => {
  assert.equal(familyCreationSlug(familyId), "family-123e4567e89b42d3a456426614174000");
  assert.equal(familyCreationSlug(familyId.toUpperCase()), "family-123e4567e89b42d3a456426614174000");
  assert.equal(familyCreationSlug("invalid"), null);
});

test("active-family cookie is http-only and same-site", () => {
  const header = activeFamilyCookieHeader(familyId);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.throws(() => activeFamilyCookieHeader("invalid"));
});

test("selected and fallback memberships both require an active family", () => {
  const selected = activeFamilyMembershipQuery("user-1", familyId);
  const fallback = activeFamilyMembershipQuery("user-1");
  for (const query of [selected, fallback]) {
    assert.equal(query.get("select"), "id,family_id,role,status,preferred_locale,families!inner()");
    assert.equal(query.get("auth_user_id"), "eq.user-1");
    assert.equal(query.get("status"), "eq.active");
    assert.equal(query.get("families.status"), "eq.active");
    assert.equal(query.get("limit"), "1");
  }
  assert.equal(selected.get("family_id"), `eq.${familyId}`);
  assert.equal(selected.has("order"), false);
  assert.equal(fallback.has("family_id"), false);
  assert.equal(fallback.get("order"), "created_at.asc");
});
