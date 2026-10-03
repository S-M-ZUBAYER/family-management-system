import assert from "node:assert/strict";
import test from "node:test";

import {
  canDeleteQurbaniCampaign,
  canTransitionQurbaniCampaign,
  isFinalizedQurbaniCampaign,
} from "../lib/qurbani-policy.ts";

test("settled and closed campaigns are finalized", () => {
  assert.equal(isFinalizedQurbaniCampaign("distribution"), false);
  assert.equal(isFinalizedQurbaniCampaign("settled"), true);
  assert.equal(isFinalizedQurbaniCampaign("closed"), true);
});

test("only settled to closed is allowed after finalization", () => {
  assert.equal(canTransitionQurbaniCampaign("settled", "closed"), true);
  assert.equal(canTransitionQurbaniCampaign("settled", "distribution"), false);
  assert.equal(canTransitionQurbaniCampaign("closed", "planning"), false);
  assert.equal(canTransitionQurbaniCampaign("distribution", "settled"), true);
  assert.equal(canTransitionQurbaniCampaign("planning", "planning"), false);
});

test("only an empty planning campaign can be deleted", () => {
  assert.equal(canDeleteQurbaniCampaign("planning", false), true);
  assert.equal(canDeleteQurbaniCampaign("planning", true), false);
  assert.equal(canDeleteQurbaniCampaign("registration", false), false);
  assert.equal(canDeleteQurbaniCampaign("closed", false), false);
});
