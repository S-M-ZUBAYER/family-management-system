import type { QurbaniParticipant, QurbaniTransaction } from "@/lib/qurbani-types";

type ParticipantPayment = Pick<QurbaniParticipant, "id" | "amount_paid">;
type PaymentEntry = Pick<QurbaniTransaction, "participant_id" | "transaction_type" | "category" | "amount">;

function centsOf(value: number | string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new RangeError("Invalid Qurbani payment amount");
  const cents = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

function moneyOf(cents: bigint): number {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Qurbani payment total exceeds XLSX numeric precision");
  }
  return Number(cents) / 100;
}

export function qurbaniPaymentReconciliation(participants: ParticipantPayment[], transactions: PaymentEntry[]) {
  const participantIds = new Set(participants.map((participant) => participant.id));
  const linkedCents = new Map<string, bigint>();
  let unmatchedEntries = 0;

  for (const transaction of transactions) {
    if (transaction.category !== "share_payment") continue;
    const participantId = transaction.participant_id;
    if (!participantId || !participantIds.has(participantId) || transaction.transaction_type === "expense") {
      unmatchedEntries += 1;
      continue;
    }
    const amount = centsOf(transaction.amount);
    linkedCents.set(participantId, (linkedCents.get(participantId) ?? BigInt(0)) + (transaction.transaction_type === "refund" ? -amount : amount));
  }

  const byParticipant = new Map<string, { recordedPaid: number; ledgerPaid: number; difference: number }>();
  let mismatchCount = 0;
  let ledgerPaidCents = BigInt(0);
  for (const participant of participants) {
    const recordedCents = centsOf(participant.amount_paid);
    const participantLedgerCents = linkedCents.get(participant.id) ?? BigInt(0);
    const differenceCents = recordedCents - participantLedgerCents;
    ledgerPaidCents += participantLedgerCents;
    if (differenceCents !== BigInt(0)) mismatchCount += 1;
    byParticipant.set(participant.id, {
      recordedPaid: moneyOf(recordedCents),
      ledgerPaid: moneyOf(participantLedgerCents),
      difference: moneyOf(differenceCents),
    });
  }

  return {
    byParticipant,
    mismatchCount,
    unmatchedEntries,
    ledgerPaidTotal: moneyOf(ledgerPaidCents),
    isBalanced: mismatchCount === 0 && unmatchedEntries === 0,
  };
}
