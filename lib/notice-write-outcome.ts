import { NoticeValidationError, noticeErrorCopy, noticeObject, noticeTimestamp, noticeUuid } from "./notice-validation.ts";

export type NoticePublicRow = {
  id: string; title_bn: string; title_en: string | null; body_bn: string; body_en: string | null;
  category: "general" | "urgent" | "event" | "finance" | "qurbani" | "health";
  priority: "normal" | "high" | "urgent"; status: "draft" | "published" | "archived";
  is_pinned: boolean; publish_at: string | null; expires_at: string | null; created_at: string; updated_at: string;
};
const text = (value: unknown, min: number, max: number) => typeof value === "string" && value.trim().length >= min && value.length <= max;
const timestamp = (value: unknown, optional = false) => {
  if (optional && value === null) return true;
  if (typeof value !== "string" || !value) return false;
  try { return noticeTimestamp(value) !== null; } catch { return false; }
};

// Project validated public fields only: never forward auth or tenant metadata.
export function noticePublicRow(value: unknown): NoticePublicRow | null {
  if (!noticeObject(value) || !noticeUuid(value.id)
    || !text(value.title_bn, 3, 180) || !text(value.body_bn, 5, 5000)
    || !(value.title_en === null || text(value.title_en, 0, 180))
    || !(value.body_en === null || text(value.body_en, 0, 5000))
    || typeof value.category !== "string" || !["general", "urgent", "event", "finance", "qurbani", "health"].includes(value.category)
    || typeof value.priority !== "string" || !["normal", "high", "urgent"].includes(value.priority)
    || typeof value.status !== "string" || !["draft", "published", "archived"].includes(value.status)
    || typeof value.is_pinned !== "boolean" || !timestamp(value.publish_at, true) || !timestamp(value.expires_at, true)
    || !timestamp(value.created_at) || !timestamp(value.updated_at)) return null;
  return Object.fromEntries(["id", "title_bn", "title_en", "body_bn", "body_en", "category", "priority", "status", "is_pinned", "publish_at", "expires_at", "created_at", "updated_at"].map(key => [key, value[key]])) as NoticePublicRow;
}
export class NoticeWriteOutcomeUnknownError extends Error {
  constructor() { super("NOTICE_WRITE_OUTCOME_UNKNOWN"); this.name = "NoticeWriteOutcomeUnknownError"; }
}
export class NoticeWriteRejectedError extends Error {
  constructor() { super("NOTICE_WRITE_REJECTED"); this.name = "NoticeWriteRejectedError"; }
}

// A confirmed record change must not become a false failure if its later audit
// fails. These are separate calls, not an atomic transaction or retry mechanism.
export async function noticeWrite(options: {
  write: () => Promise<unknown>; expectedId?: string; deletion?: boolean;
  confirmedRejected: (error: unknown) => boolean; audit: (id: string) => Promise<unknown>;
}) {
  let id: string, notice: NoticePublicRow | null = null;
  try {
    const rows = await options.write();
    if (Array.isArray(rows) && rows.length === 0 && options.expectedId) throw new NoticeValidationError("NOTICE_RECORD_CHANGED");
    if (!Array.isArray(rows) || rows.length !== 1 || !noticeObject(rows[0]) || !noticeUuid(rows[0].id)
      || (options.expectedId && rows[0].id.toLowerCase() !== options.expectedId.toLowerCase())) throw new NoticeWriteOutcomeUnknownError();
    id = rows[0].id;
    if (!options.deletion) {
      notice = noticePublicRow(rows[0]);
      if (!notice) throw new NoticeWriteOutcomeUnknownError();
    }
  } catch (error) {
    if (error instanceof NoticeValidationError) throw error;
    if (options.confirmedRejected(error)) throw new NoticeWriteRejectedError();
    throw new NoticeWriteOutcomeUnknownError();
  }
  let auditPending = false;
  try { await options.audit(id); } catch { auditPending = true; console.error("Notice write confirmed; audit logging pending."); }
  return { id, notice, auditPending };
}
export function noticeWriteResponse(result: Awaited<ReturnType<typeof noticeWrite>>, status = 200) {
  return Response.json({ success: true, id: result.id, ...(result.notice ? { notice: result.notice } : {}),
    ...(result.auditPending ? { code: "NOTICE_AUDIT_PENDING", auditPending: true } : {}) }, { status: result.auditPending ? 202 : status });
}
export function noticeMutationAcknowledged(method: string, id: string | undefined, body: Record<string, unknown>, status: number, raw: unknown) {
  if (!noticeObject(raw) || raw.success !== true || !noticeUuid(raw.id) || raw.outcomeUnknown === true
    || (Object.hasOwn(raw, "auditPending") && typeof raw.auditPending !== "boolean")
    || (status === 202) !== (raw.auditPending === true)
    || (status === 202 && raw.code !== "NOTICE_AUDIT_PENDING")) return false;
  if (id && raw.id.toLowerCase() !== id.toLowerCase()) return false;
  if (method === "DELETE") return !!id && [200, 202].includes(status);
  const notice = noticePublicRow(raw.notice);
  if (!notice || notice.id !== raw.id) return false;
  if (method === "POST") return [201, 202].includes(status) && notice.status === (body.status ?? "draft") && notice.is_pinned === (body.isPinned ?? false);
  if (method !== "PATCH" || !id || ![200, 202].includes(status)) return false;
  if (typeof body.action !== "string") return false;
  if (body.action === "edit") return noticeObject(body.data) && notice.status === body.data.status && notice.is_pinned === body.data.isPinned;
  if (body.action === "pin" || body.action === "unpin") return notice.is_pinned === (body.action === "pin");
  return notice.status === ({ publish: "published", draft: "draft", archive: "archived" } as Record<string, string>)[body.action];
}
export function noticeWriteFeedback(path: string, status: number, payload: Record<string, unknown>, locale: "bn" | "en", method = "", body: Record<string, unknown> = {}) {
  const match = /^\/api\/notices(?:\/([0-9a-f-]+))?$/i.exec(path);
  if (!match) return null;
  if (status >= 500 || status === 408 || payload.outcomeUnknown === true
    || (status >= 200 && status < 300 && !noticeMutationAcknowledged(method, match[1], body, status, payload))) return {
    kind: "info" as const, title: locale === "bn" ? "নোটিশের ফল যাচাই প্রয়োজন" : "Notice outcome needs verification",
    message: noticeErrorCopy("NOTICE_WRITE_OUTCOME_UNKNOWN", locale)!,
  };
  if (status === 202 && payload.auditPending === true) return {
    kind: "info" as const, title: locale === "bn" ? "নোটিশ সংরক্ষিত; audit বাকি" : "Notice saved; audit pending",
    message: noticeErrorCopy("NOTICE_AUDIT_PENDING", locale)!,
  };
  return null;
}
export async function readNoticeMutation(request: () => Promise<Response>, method: string, id: string | undefined, body: Record<string, unknown>) {
  try {
    const response = await request();
    if (response.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await response.json().catch(() => null);
    const payload = noticeObject(raw) ? raw : {};
    if (response.status >= 500 || response.status === 408 || payload.outcomeUnknown === true) return { kind: "unknown" as const, payload };
    if (!response.ok) return { kind: "rejected" as const, payload };
    if (!noticeMutationAcknowledged(method, id, body, response.status, raw)) return { kind: "unknown" as const, payload };
    return { kind: "confirmed" as const, payload, notice: noticePublicRow(payload.notice), auditPending: payload.auditPending === true };
  } catch { return { kind: "unknown" as const, payload: {} }; }
}
export function noticeReadSnapshot(raw: unknown) {
  if (!noticeObject(raw) || !noticeObject(raw.family) || !noticeUuid(raw.family.id)
    || !text(raw.family.name_bn, 1, 300) || !(raw.family.name_en === null || text(raw.family.name_en, 0, 300))
    || !noticeObject(raw.permissions) || typeof raw.permissions.canManage !== "boolean"
    || typeof raw.migrationRequired !== "boolean" || !Array.isArray(raw.notices) || raw.notices.length > 20000) return null;
  const notices: NoticePublicRow[] = [], ids = new Set<string>();
  for (const value of raw.notices) {
    const row = noticePublicRow(value);
    if (!row || ids.has(row.id.toLowerCase()) || (noticeObject(value) && Object.hasOwn(value, "family_id") && value.family_id !== raw.family.id)) return null;
    ids.add(row.id.toLowerCase()); notices.push(row);
  }
  return { family: { id: raw.family.id as string, name_bn: raw.family.name_bn as string, name_en: raw.family.name_en as string | null }, notices,
    permissions: { canManage: raw.permissions.canManage as boolean }, migrationRequired: raw.migrationRequired as boolean };
}

export class NoticeRequestGate {
  private generation = 0;
  private controller: AbortController | null = null;
  begin() { this.cancel(); this.controller = new AbortController(); return { generation: this.generation, controller: this.controller }; }
  current(ticket: { generation: number }) { return ticket.generation === this.generation; }
  cancel() { this.generation++; this.controller?.abort(); this.controller = null; }
}
