import assert from "node:assert/strict";
import test from "node:test";

import { decisionVisibleForPoll } from "../lib/governance-visibility.ts";

test("a decision linked to a hidden admin poll does not reach family members", () => {
  const visiblePollIds = new Set(["family-poll"]);
  assert.equal(decisionVisibleForPoll({ poll_id: "admin-poll" }, visiblePollIds), false);
  assert.equal(decisionVisibleForPoll({ poll_id: "family-poll" }, visiblePollIds), true);
});

test("a standalone family decision remains visible", () => {
  assert.equal(decisionVisibleForPoll({ poll_id: null }, new Set()), true);
});
