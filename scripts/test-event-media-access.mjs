import assert from "node:assert/strict";
import { canViewEventMedia } from "../lib/event-media-access.ts";

assert.equal(canViewEventMedia(null, false), false);
assert.equal(canViewEventMedia(null, true), false);
assert.equal(canViewEventMedia("draft", false), false);
assert.equal(canViewEventMedia("draft", true), true);
assert.equal(canViewEventMedia("unknown", true), false);
for (const status of ["published", "registration_closed", "completed", "cancelled"]) {
  assert.equal(canViewEventMedia(status, false), true);
  assert.equal(canViewEventMedia(status, true), true);
}
console.log("Event media access policy passed.");
