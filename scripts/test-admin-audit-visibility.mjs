import assert from "node:assert/strict";
import test from "node:test";

import { visibleAdministrationAuditLogs } from "../lib/admin-audit-visibility.ts";

const entry = (id, actor_user_id, action, entity_type, metadata = {}) => ({ id, actor_user_id, action, entity_type, metadata });

test("another member's private finance and health events stay out of admin audit responses", () => {
  const rows = [
    entry(1, "member-a", "personal_finance_transaction_created", "personal_finance_transaction", { private: true }),
    entry(2, "member-a", "health_medication_updated", "health_medication", { private: true }),
    entry(3, "member-a", "archive_vault_uploaded", "archive_vault_documents", { visibility: "private", file_id: "private-file" }),
    entry(4, "member-a", "family_notice_created", "family_notice"),
  ];
  assert.deepEqual(visibleAdministrationAuditLogs(rows, "admin-b").map((row) => row.id), [4]);
});

test("older unmarked finance events are also hidden, while own private events remain visible", () => {
  const rows = [
    entry(1, "member-a", "personal_finance_bill_updated", "bill"),
    entry(2, "member-a", "record_updated", "personal_finance_goal"),
    entry(3, "admin-b", "personal_finance_bill_updated", "personal_finance_bill", { private: true }),
  ];
  assert.deepEqual(visibleAdministrationAuditLogs(rows, "admin-b").map((row) => row.id), [3]);
});

test("family-wide safety and administrative events remain visible", () => {
  const rows = [
    entry(1, "member-a", "health_sos_created", "health_sos_alert", { alert_type: "medical" }),
    entry(2, "member-a", "family_membership_updated", "family_membership", null),
  ];
  assert.deepEqual(visibleAdministrationAuditLogs(rows, "admin-b").map((row) => row.id), [1, 2]);
});
