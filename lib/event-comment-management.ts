import { eventObject, eventUuid, EventValidationError, eventErrorCopy } from "./event-validation.ts";
import { eventCommentRecord, eventCommentPublicRow, eventCommentVisible } from "./event-participation.ts";
import { EventWriteOutcomeUnknownError, EventWriteRejectedError } from "./event-write-outcome.ts";
export type CommentMethod = "PATCH" | "DELETE";
export function eventCommentChangeRecord(method: CommentMethod, value: unknown) {
  if (!["PATCH", "DELETE"].includes(method)) throw new EventValidationError("EVENT_INVALID_OPTION");
  if (!eventObject(value) || Object.keys(value).some(key => !["expectedBody", ...(method === "PATCH" ? ["body"] : [])].includes(key))) throw new EventValidationError("EVENT_INVALID_BODY");
  if (typeof value.expectedBody !== "string" || value.expectedBody.trim().length < 2 || value.expectedBody.length > 2000) throw new EventValidationError("EVENT_COMMENT_VERSION_REQUIRED");
  return { expectedBody: value.expectedBody, ...(method === "PATCH" ? eventCommentRecord(value) : {}) };
}
export function eventCommentMayChange(method: CommentMethod, row: unknown, parent: unknown, actorId: string, canManage: boolean) {
  if (!["PATCH", "DELETE"].includes(method)) return false;
  if (!eventObject(row) || !eventCommentPublicRow(row) || typeof row.auth_user_id !== "string" || !row.auth_user_id
    || !eventObject(parent) || parent.id !== row.event_id || !actorId || typeof canManage !== "boolean") return false;
  const own = row.auth_user_id === actorId;
  if (method === "PATCH") return own && eventCommentVisible(parent);
  return (own || canManage) && (eventCommentVisible(parent) || (canManage && parent.status === "draft"));
}
// Single-column eq takes its complete operand literally (not in/or grammar).
// URLSearchParams encodes punctuation/newlines so they cannot add query keys.
// Do not add quotes: the installed backend compares those as actual text.
// Exact prior text is a content-CAS guard, not a durable revision/ABA token.
export function eventCommentFilterText(value: string) { return `eq.${value}`; }
export async function eventCommentChangeWrite(options: {
  method: CommentMethod; row: Record<string, unknown>; actorId: string; body?: string;
  write: () => Promise<unknown>; audit: () => Promise<unknown>; confirmedRejected: (error: unknown) => boolean;
}) {
  let saved: Record<string, unknown>;
  try {
    const result = await options.write();
    if (Array.isArray(result) && result.length === 0) throw new EventValidationError("EVENT_COMMENT_CHANGED");
    if (!Array.isArray(result) || result.length !== 1 || !eventObject(result[0])) throw new EventWriteOutcomeUnknownError();
    saved = result[0];
    for (const key of ["id", "family_id", "event_id", "auth_user_id", "author_name", "created_at"]) if (saved[key] !== options.row[key]) throw new EventWriteOutcomeUnknownError();
    if (!eventCommentPublicRow(saved) || saved.body !== (options.method === "PATCH" ? options.body : options.row.body)) throw new EventWriteOutcomeUnknownError();
  } catch (error) {
    if (error instanceof EventValidationError) throw error;
    if (options.confirmedRejected(error)) throw new EventWriteRejectedError();
    throw new EventWriteOutcomeUnknownError();
  }
  let auditPending = false;
  try { await options.audit(); } catch { auditPending = true; console.error("Event comment change confirmed; audit pending."); }
  return { id: saved.id as string, eventId: saved.event_id as string, comment: options.method === "PATCH" ? eventCommentPublicRow(saved, saved.auth_user_id === options.actorId) : null, auditPending };
}
export function eventCommentChangeResponse(result: Awaited<ReturnType<typeof eventCommentChangeWrite>>) {
  return Response.json({ success: true, id: result.id, eventId: result.eventId,
    ...(result.comment ? { comment: result.comment } : { deleted: true }),
    ...(result.auditPending ? { code: "EVENT_COMMENT_CHANGE_PENDING", auditPending: true } : {}) }, { status: result.auditPending ? 202 : 200 });
}
export function eventCommentChangeAcknowledged(method: CommentMethod, id: string, eventId: string, body: Record<string, unknown>, status: number, raw: unknown) {
  if (!eventUuid(id) || !eventUuid(eventId) || !eventObject(raw) || raw.success !== true || raw.id !== id || raw.eventId !== eventId
    || raw.outcomeUnknown === true || ![200, 202].includes(status) || (Object.hasOwn(raw, "auditPending") && typeof raw.auditPending !== "boolean")
    || (status === 202) !== (raw.auditPending === true) || (status === 202 && raw.code !== "EVENT_COMMENT_CHANGE_PENDING")) return false;
  try {
    const record = eventCommentChangeRecord(method, body);
    if (method === "DELETE") return raw.deleted === true && !Object.hasOwn(raw, "comment");
    const row = eventCommentPublicRow(raw.comment);
    return raw.deleted !== true && !!row && row.id === id && row.event_id === eventId && row.is_current_user === true && row.body === record.body;
  } catch { return false; }
}
export function eventCommentChangeFeedback(path: string, status: number, raw: Record<string, unknown>, locale: "bn" | "en", method = "", body: Record<string, unknown> = {}) {
  const match = /^\/api\/event-comments\/([0-9a-f-]+)$/i.exec(path); if (!match) return null;
  if (status >= 500 || status === 408 || raw.outcomeUnknown === true || (status >= 200 && status < 300 && (!["PATCH", "DELETE"].includes(method) || typeof raw.eventId !== "string" || !eventCommentChangeAcknowledged(method as CommentMethod, match[1], raw.eventId, body, status, raw)))) return {
    kind: "info" as const, title: locale === "bn" ? "মন্তব্যের ফল যাচাই প্রয়োজন" : "Comment outcome needs verification", message: eventErrorCopy("EVENT_COMMENT_CHANGE_UNKNOWN", locale)!,
  };
  if (status === 202) return { kind: "info" as const, title: locale === "bn" ? "মন্তব্য বদলেছে; audit বাকি" : "Comment changed; audit pending", message: eventErrorCopy("EVENT_COMMENT_CHANGE_PENDING", locale)! };
  return null;
}
export async function readEventCommentChange(request: () => Promise<Response>, method: CommentMethod, id: string, eventId: string, body: Record<string, unknown>) {
  try {
    const response = await request(); if (response.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await response.json().catch(() => null), payload = eventObject(raw) ? raw : {};
    if (response.status >= 500 || response.status === 408 || payload.outcomeUnknown === true) return { kind: "unknown" as const };
    if (!response.ok) return { kind: "rejected" as const, payload };
    if (!eventCommentChangeAcknowledged(method, id, eventId, body, response.status, raw)) return { kind: "unknown" as const };
    return { kind: "confirmed" as const, comment: method === "PATCH" ? eventCommentPublicRow(payload.comment) : null, pending: payload.auditPending === true };
  } catch { return { kind: "unknown" as const }; }
}
