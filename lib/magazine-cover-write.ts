import { magazineErrorCopy } from "./magazine-validation.ts";
import { magazineRecordAcknowledged, magazineRecordFeedback } from "./magazine-record-write.ts";
export class MagazineCoverOutcomeUnknownError extends Error {
  constructor() { super("MAGAZINE_COVER_OUTCOME_UNKNOWN"); this.name = "MagazineCoverOutcomeUnknownError"; }
}
// Metadata may have committed before its response was lost. Never delete the
// stored image or repeat the insert in that case. Only confirmed rejections
// permit removing this request's unlinked object.
export async function magazineCoverWrite<T>(options: {
  put: () => Promise<unknown>; create: () => Promise<T>; valid: (value: T) => boolean;
  discardUnlinked: () => Promise<unknown>; confirmedRejected: (error: unknown) => boolean;
  cleanupOld: (value: T) => Promise<unknown>; audit: (value: T) => Promise<unknown>;
}) {
  try { await options.put(); }
  catch (error) { await options.discardUnlinked().catch(() => console.error("Unlinked magazine object cleanup needs reconciliation.")); throw error; }
  let value: T;
  try { value = await options.create(); if (!options.valid(value)) throw new MagazineCoverOutcomeUnknownError(); }
  catch (error) {
    if (options.confirmedRejected(error)) {
      await options.discardUnlinked().catch(() => console.error("Unlinked magazine object cleanup needs reconciliation."));
      throw error;
    }
    throw new MagazineCoverOutcomeUnknownError();
  }
  let cleanupPending = false, auditPending = false;
  try { await options.cleanupOld(value); } catch { cleanupPending = true; console.error("Magazine cover saved; prior cover cleanup needs reconciliation."); }
  try { await options.audit(value); } catch { auditPending = true; console.error("Magazine cover saved; audit logging needs reconciliation."); }
  return { value, cleanupPending, auditPending };
}

export function magazineCoverFeedback(status: number, payload: Record<string, unknown>, locale: "bn" | "en") {
  if (status === 503 && payload.code === "MAGAZINE_COVER_OUTCOME_UNKNOWN" && payload.outcomeUnknown === true) return {
    kind: "info" as const, title: locale === "bn" ? "কভার যাচাই প্রয়োজন" : "Cover needs verification",
    message: locale === "bn" ? "কভার সংরক্ষণ হয়েছে কি না নিশ্চিত হওয়া যায়নি। আবার আপলোড করবেন না; তালিকা রিলোড করে কভার যাচাই করুন।"
      : "The cover save could not be confirmed. Do not upload again; reload the library and verify the cover.",
  };
  if (status === 202 && (payload.cleanupPending === true || payload.auditPending === true)) return {
    kind: "info" as const, title: locale === "bn" ? "কভার সংরক্ষিত; কিছু কাজ বাকি" : "Cover saved; some work is pending",
    message: locale === "bn" ? "নতুন কভার সংরক্ষিত হয়েছে। পুরোনো কভার পরিষ্কার বা অডিট লগের কাজ বাকি আছে; আবার আপলোড না করে সাপোর্টে যোগাযোগ করুন।"
      : "The new cover was saved. Previous-cover cleanup or audit logging is pending; contact support instead of uploading again.",
  };
  return null;
}

export function magazineWriteFeedback(path: string, status: number, payload: Record<string, unknown>, locale: "bn" | "en", method?: string, body?: Record<string, unknown>) {
  if (path === "/api/magazine/upload") {
    if (status === 413) return { kind: "error" as const, title: locale === "bn" ? "কভারটি বড়" : "Cover is too large", message: magazineErrorCopy("MAGAZINE_INVALID_COVER", locale)! };
    const known = magazineCoverFeedback(status, payload, locale);
    if (known) return known;
    if (status >= 500 && payload.code !== "MAGAZINE_STORAGE_UNAVAILABLE") return magazineCoverFeedback(503, { code: "MAGAZINE_COVER_OUTCOME_UNKNOWN", outcomeUnknown: true }, locale);
  }
  if (path === "/api/magazine/records") {
    if (status === 408 || (status >= 200 && status < 300 && method && body && !magazineRecordAcknowledged(method, body, status, payload))) return magazineRecordFeedback(503, { outcomeUnknown: true }, locale);
    return magazineRecordFeedback(status, payload, locale);
  }
  return null;
}
