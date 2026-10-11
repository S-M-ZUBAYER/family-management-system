import { MagazineValidationError, magazineErrorCopy } from "./magazine-validation.ts";

export class MagazineRecordOutcomeUnknownError extends Error {
  constructor() { super("MAGAZINE_WRITE_OUTCOME_UNKNOWN"); this.name = "MagazineRecordOutcomeUnknownError"; }
}
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// A write acknowledgement and its later audit/cleanup are different outcomes.
// Never retry or compensate an unconfirmed write. A confirmed empty conditional
// match is a conflict, not proof of persistence and not an audit event.
export async function magazineRecordWrite<T>(options: {
  write: () => Promise<T>; expectedId?: string; confirmedRejected: (error: unknown) => boolean;
  audit: (id: string) => Promise<unknown>; cleanup?: () => Promise<unknown>;
}) {
  let id: string;
  try {
    const rows = await options.write();
    if (Array.isArray(rows) && rows.length === 0 && options.expectedId) throw new MagazineValidationError("MAGAZINE_RECORD_CHANGED");
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || !uuid(rows[0].id)
      || (options.expectedId && rows[0].id !== options.expectedId)) throw new MagazineRecordOutcomeUnknownError();
    id = rows[0].id;
  } catch (error) {
    if (options.confirmedRejected(error)) throw error;
    throw new MagazineRecordOutcomeUnknownError();
  }
  let auditPending = false, cleanupPending = false;
  if (options.cleanup) try { await options.cleanup(); } catch { cleanupPending = true; console.error("Magazine record write confirmed; file cleanup pending."); }
  try { await options.audit(id); } catch { auditPending = true; console.error("Magazine record write confirmed; audit logging pending."); }
  return { id, auditPending, cleanupPending };
}
export function magazineRecordResponse(result: { id: string; auditPending: boolean; cleanupPending: boolean }, payload: Record<string, unknown> = {}, status = 200) {
  return Response.json({ ...payload, success: true, id: result.id,
    ...(result.auditPending || result.cleanupPending ? { code: "MAGAZINE_WRITE_PENDING", auditPending: result.auditPending, cleanupPending: result.cleanupPending } : {}) },
  { status: result.auditPending || result.cleanupPending ? 202 : status });
}

export function magazineRecordAcknowledged(method: string, body: Record<string, unknown>, status: number, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>, data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
  if (["auditPending", "cleanupPending"].some(key => Object.hasOwn(payload, key) && typeof payload[key] !== "boolean")) return false;
  if ((status === 202) !== (payload.auditPending === true || payload.cleanupPending === true)) return false;
  if (status === 202 && !(payload.auditPending === true || payload.cleanupPending === true)) return false;
  if (payload.outcomeUnknown === true || payload.success !== true || !uuid(payload.id)) return false;
  if (method === "PATCH") return [200,202].includes(status) && payload.id === body.articleId;
  if (method === "DELETE") return [200,202].includes(status) && payload.id === body.recordId;
  if (method !== "POST") return false;
  if (body.action === "create_article") return [201,202].includes(status) && ["draft","pending","published"].includes(String(payload.status));
  if (body.action === "add_comment") return [201,202].includes(status);
  if (body.action === "set_status") return [200,202].includes(status) && payload.id === data.articleId && payload.status === data.status;
  if (body.action === "moderate_comment") return [200,202].includes(status) && payload.id === data.commentId;
  // Reaction row IDs are internal: the API acknowledges the article identity.
  return body.action === "toggle_like" && [200,202].includes(status) && payload.id === data.articleId && typeof payload.reacted === "boolean";
}
export function magazineRecordFeedback(status: number, payload: Record<string, unknown>, locale: "bn" | "en") {
  if (status >= 500 || payload.outcomeUnknown === true) return {
    kind: "info" as const, title: locale === "bn" ? "ম্যাগাজিনের ফল যাচাই প্রয়োজন" : "Magazine outcome needs verification",
    message: magazineErrorCopy("MAGAZINE_WRITE_OUTCOME_UNKNOWN", locale)!,
  };
  if (status === 202 && (payload.auditPending === true || payload.cleanupPending === true)) return {
    kind: "info" as const, title: locale === "bn" ? "পরিবর্তন সংরক্ষিত; কিছু কাজ বাকি" : "Change saved; some work is pending",
    message: magazineErrorCopy("MAGAZINE_WRITE_PENDING", locale)!,
  };
  return null;
}
export async function readMagazineMutation(request: () => Promise<Response>, method: string, body: Record<string, unknown>) {
  try {
    const response = await request();
    if (response.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await response.json().catch(() => null);
    const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    if (response.status >= 500 || response.status === 408 || payload.outcomeUnknown === true) return { kind: "unknown" as const, payload };
    if (!response.ok) return { kind: "rejected" as const, payload };
    if (!magazineRecordAcknowledged(method, body, response.status, raw)) return { kind: "unknown" as const, payload };
    return { kind: "confirmed" as const, payload };
  } catch { return { kind: "unknown" as const, payload: {} }; }
}
