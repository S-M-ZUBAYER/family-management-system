import assert from "node:assert/strict";
import test from "node:test";

import { visibleEmergencyDirectory } from "../lib/health-directory-visibility.ts";

const base = {
  member_name: "Member",
  blood_group: "A+",
  conditions: "Condition",
  allergies: "Allergy",
  emergency_notes: "Note",
  emergency_contact_name: "Contact",
  emergency_contact_phone: "123",
  donor_available: false,
  last_donation_date: null,
};

test("explicit emergency-access opt-out removes the member entirely", () => {
  const rows = [
    { ...base, auth_user_id: "blocked", visibility: "family" },
    { ...base, auth_user_id: "visible", visibility: "family" },
  ];
  const result = visibleEmergencyDirectory(rows, ["blocked"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].member_name, "Member");
  assert.equal("auth_user_id" in result[0], false);
});

test("private donor shows only donor details, never emergency notes or contacts", () => {
  const result = visibleEmergencyDirectory([{ ...base, auth_user_id: "donor", visibility: "private", donor_available: true }], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].blood_group, "A+");
  assert.equal(result[0].conditions, null);
  assert.equal(result[0].allergies, null);
  assert.equal(result[0].emergency_contact_phone, null);
});

test("private non-donor is not listed and emergency-only hides conditions", () => {
  const result = visibleEmergencyDirectory([
    { ...base, auth_user_id: "private", visibility: "private" },
    { ...base, auth_user_id: "emergency", visibility: "emergency" },
  ], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].conditions, null);
  assert.equal(result[0].allergies, "Allergy");
});
