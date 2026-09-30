import assert from "node:assert/strict";
import test from "node:test";

import { notificationVisibleToUser, safeNotificationActionPath } from "../lib/notification-visibility.ts";

const now = Date.parse("2026-09-30T12:00:00.000Z");
const preferences = {
  in_app_enabled: true,
  family_announcements: true,
  membership_updates: true,
  event_reminders: false,
  qurbani_updates: true,
  health_reminders: true,
  finance_reminders: true,
  governance_updates: true,
  household_updates: true,
};
const row = { recipient_user_id: null, category: "event", severity: "info", scheduled_for: "2026-09-30T11:00:00.000Z", expires_at: null };

test("category and in-app preferences control ordinary notifications", () => {
  assert.equal(notificationVisibleToUser(row, "member-a", preferences, now), false);
  assert.equal(notificationVisibleToUser({ ...row, category: "qurbani" }, "member-a", preferences, now), true);
  assert.equal(notificationVisibleToUser({ ...row, category: "qurbani" }, "member-a", { ...preferences, in_app_enabled: false }, now), false);
});

test("urgent and system alerts remain visible but tenant recipient and time limits still apply", () => {
  const off = { ...preferences, in_app_enabled: false };
  assert.equal(notificationVisibleToUser({ ...row, severity: "urgent" }, "member-a", off, now), true);
  assert.equal(notificationVisibleToUser({ ...row, category: "system" }, "member-a", off, now), true);
  assert.equal(notificationVisibleToUser({ ...row, severity: "urgent", recipient_user_id: "member-b" }, "member-a", off, now), false);
  assert.equal(notificationVisibleToUser({ ...row, severity: "urgent", scheduled_for: "2026-09-30T13:00:00.000Z" }, "member-a", off, now), false);
  assert.equal(notificationVisibleToUser({ ...row, severity: "urgent", expires_at: "2026-09-30T12:00:00.000Z" }, "member-a", off, now), false);
});

test("notification action links stay on this site", () => {
  assert.equal(safeNotificationActionPath("/events?year=2026#photos"), "/events?year=2026#photos");
  for (const value of ["https://outside.example", "//outside.example", "/\\outside.example", "javascript:alert(1)", "/events\n//outside.example"]) {
    assert.equal(safeNotificationActionPath(value), null, value);
  }
});
