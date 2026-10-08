import { welfareErrorCopy } from "./welfare-error-copy.ts";
type Locale = "bn" | "en";

export class WelfareWriteOutcomeUnknownError extends Error {
  constructor() { super("WELFARE_WRITE_OUTCOME_UNKNOWN"); this.name = "WelfareWriteOutcomeUnknownError"; }
}

// Never retry/compensate a financial write from a lost response. An audit
// outage after a confirmed write must not masquerade as a failed mutation.
export async function welfareWrite<T>(options: {
  write: () => Promise<T>;
  valid: (value: T) => boolean;
  audit?: (value: T) => Promise<void>;
  confirmedRejected: (error: unknown) => boolean;
}) {
  let value: T;
  try {
    value = await options.write();
    if (!options.valid(value)) throw new WelfareWriteOutcomeUnknownError();
  } catch (error) {
    if (options.confirmedRejected(error)) throw error;
    throw new WelfareWriteOutcomeUnknownError();
  }
  let auditPending = false;
  if (options.audit) try { await options.audit(value); }
  catch { auditPending = true; console.error("Welfare write confirmed; audit logging pending. Reconcile before retrying."); }
  return { value, auditPending };
}

export function welfareRecordFeedback(status: number, payload: Record<string, unknown>, locale: Locale) {
  if (status === 503 && payload.outcomeUnknown === true && payload.code === "WELFARE_WRITE_OUTCOME_UNKNOWN") {
    return { kind: "info" as const, title: locale === "bn" ? "ফল যাচাই প্রয়োজন" : "Outcome needs verification", message: welfareErrorCopy("WELFARE_WRITE_OUTCOME_UNKNOWN", locale)! };
  }
  if (status === 202 && payload.auditPending === true) {
    return { kind: "info" as const, title: locale === "bn" ? "অডিট লগ বাকি আছে" : "Audit logging is pending", message: locale === "bn"
      ? "রেকর্ডের পরিবর্তন সংরক্ষিত হয়েছে। অডিট লগ লেখা বাকি আছে; কাজটি আবার পাঠাবেন না। তালিকা রিলোড করে সাপোর্টে যোগাযোগ করুন।"
      : "The record change was saved. Audit logging is pending; do not submit the action again. Reload the list and contact support." };
  }
  return null;
}
