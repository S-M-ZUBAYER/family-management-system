import assert from "node:assert/strict";
import test from "node:test";

import {
  canMemberSeeWelfareContribution,
  canMemberSeeWelfareDocument,
  canMemberSeeWelfareExpense,
  canMemberSeeWelfareRequest,
} from "../lib/welfare-visibility.ts";

const visibleFundIds = new Set(["family-fund"]);
const userId = "member-a";

test("hidden funds do not expose approved contributions or paid expenses to unrelated members", () => {
  assert.equal(canMemberSeeWelfareContribution({ fund_id: "private-fund", contributor_user_id: "member-b", status: "approved" }, visibleFundIds, userId), false);
  assert.equal(canMemberSeeWelfareExpense({ fund_id: "private-fund", status: "paid" }, visibleFundIds), false);
  assert.equal(canMemberSeeWelfareContribution({ fund_id: "family-fund", contributor_user_id: "member-b", status: "approved" }, visibleFundIds, userId), true);
  assert.equal(canMemberSeeWelfareExpense({ fund_id: "family-fund", status: "pending" }, visibleFundIds), false);
});

test("members retain access to their own contributions and requests", () => {
  assert.equal(canMemberSeeWelfareContribution({ fund_id: "private-fund", contributor_user_id: userId, status: "pending" }, visibleFundIds, userId), true);
  assert.equal(canMemberSeeWelfareRequest({ fund_id: "private-fund", requester_user_id: userId, visibility: "admins", status: "under_review" }, visibleFundIds, userId), true);
});

test("public requests require a visible parent fund and approved status", () => {
  assert.equal(canMemberSeeWelfareRequest({ fund_id: "private-fund", requester_user_id: "member-b", visibility: "family", status: "approved" }, visibleFundIds, userId), false);
  assert.equal(canMemberSeeWelfareRequest({ fund_id: "family-fund", requester_user_id: "member-b", visibility: "family", status: "under_review" }, visibleFundIds, userId), false);
  assert.equal(canMemberSeeWelfareRequest({ fund_id: "family-fund", requester_user_id: "member-b", visibility: "family", status: "disbursed" }, visibleFundIds, userId), true);
});

test("family-visible documents cannot bypass private parent access", () => {
  assert.equal(canMemberSeeWelfareDocument({ visibility: "family", uploaded_by_user_id: "admin" }, false, userId), false);
  assert.equal(canMemberSeeWelfareDocument({ visibility: "family", uploaded_by_user_id: "admin" }, true, userId), true);
  assert.equal(canMemberSeeWelfareDocument({ visibility: "admins", uploaded_by_user_id: "admin" }, true, userId), false);
  assert.equal(canMemberSeeWelfareDocument({ visibility: "admins", uploaded_by_user_id: userId }, true, userId), true);
});
