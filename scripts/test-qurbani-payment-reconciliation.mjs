import assert from "node:assert/strict";
import test from "node:test";

import { qurbaniPaymentReconciliation } from "../lib/qurbani-payment-reconciliation.ts";

test("linked collections and refunds must match the participant's recorded paid amount", () => {
  const result = qurbaniPaymentReconciliation(
    [{ id: "participant-a", amount_paid: "200.30" }],
    [
      { participant_id: "participant-a", category: "share_payment", transaction_type: "collection", amount: "200.10" },
      { participant_id: "participant-a", category: "share_payment", transaction_type: "collection", amount: "0.20" },
    ],
  );
  assert.equal(result.isBalanced, true);
  assert.equal(result.ledgerPaidTotal, 200.3);
  assert.deepEqual(result.byParticipant.get("participant-a"), { recordedPaid: 200.3, ledgerPaid: 200.3, difference: 0 });

  const withRefund = qurbaniPaymentReconciliation(
    [{ id: "participant-a", amount_paid: "190.05" }],
    [
      { participant_id: "participant-a", category: "share_payment", transaction_type: "collection", amount: "200.30" },
      { participant_id: "participant-a", category: "share_payment", transaction_type: "refund", amount: "10.25" },
    ],
  );
  assert.equal(withRefund.isBalanced, true);
  assert.equal(withRefund.ledgerPaidTotal, 190.05);
});

test("manual/ledger differences and unlinked share payments block reconciliation", () => {
  const result = qurbaniPaymentReconciliation(
    [{ id: "participant-a", amount_paid: 0 }, { id: "participant-b", amount_paid: "50.00" }],
    [
      { participant_id: "participant-a", category: "share_payment", transaction_type: "collection", amount: "200.50" },
      { participant_id: null, category: "share_payment", transaction_type: "collection", amount: "10.00" },
      { participant_id: "deleted-participant", category: "share_payment", transaction_type: "refund", amount: "1.00" },
      { participant_id: "participant-a", category: "transport", transaction_type: "expense", amount: "5.00" },
    ],
  );
  assert.equal(result.isBalanced, false);
  assert.equal(result.mismatchCount, 2);
  assert.equal(result.unmatchedEntries, 2);
  assert.equal(result.byParticipant.get("participant-a")?.difference, -200.5);
  assert.equal(result.byParticipant.get("participant-b")?.difference, 50);
});
