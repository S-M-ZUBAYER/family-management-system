import { eventObject, eventUuid, eventTimestamp, eventStatuses, EventValidationError, eventErrorCopy } from "./event-validation.ts";
import { EventWriteOutcomeUnknownError, EventWriteRejectedError, type EventRsvpPublic, type EventCommentPublic } from "./event-write-outcome.ts";
export type ParticipationKind = "rsvp" | "comment";
const invalid = (code: string): never => { throw new EventValidationError(code); };
const text = (value: unknown, max: number, nullable = false): string | null => {
  if (nullable && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || value.trim().length > max) return invalid("EVENT_PARTICIPATION_INVALID_TEXT");
  return value.trim() || null;
};
export function eventRsvpRecord(value: unknown) {
  if (!eventObject(value)) return invalid("EVENT_INVALID_BODY");
  if (typeof value.response !== "string" || !["going", "maybe", "not_going"].includes(value.response)) return invalid("EVENT_RSVP_INVALID_RESPONSE");
  const raw = value.guestCount === undefined ? 0 : value.guestCount;
  const count = typeof raw === "number" ? raw : typeof raw === "string" && /^(?:[0-9]|10)$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(count) || count < 0 || count > 10) return invalid("EVENT_RSVP_INVALID_GUESTS");
  return { response: value.response as "going" | "maybe" | "not_going", guest_count: count, note: text(value.note, 500, true) };
}
export function eventCommentRecord(value: unknown) {
  if (!eventObject(value)) return invalid("EVENT_INVALID_BODY");
  const body = text(value.body, 2000);
  if (!body || body.length < 2) return invalid("EVENT_PARTICIPATION_INVALID_TEXT");
  return { body };
}
export function eventRsvpOpen(event: unknown, now = Date.now()) {
  if (!eventObject(event) || event.status !== "published" || !Number.isFinite(now)) return false;
  if (event.registration_deadline === null) return true;
  try { return typeof event.registration_deadline === "string" && !!eventTimestamp(event.registration_deadline, true) && Date.parse(event.registration_deadline) > now; } catch { return false; }
}
export function eventCommentVisible(event: unknown) {
  return eventObject(event) && typeof event.status === "string" && (eventStatuses as readonly string[]).includes(event.status) && event.status !== "draft";
}
const stamp = (value: unknown) => { try { return typeof value === "string" && !!eventTimestamp(value, true); } catch { return false; } };
const name = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.length <= 180;
export function eventRsvpPublicRow(value: unknown, own?: boolean): EventRsvpPublic | null {
  if (!eventObject(value) || !eventUuid(value.id) || !eventUuid(value.event_id) || !name(value.respondent_name) || !stamp(value.updated_at)
    || typeof value.response !== "string" || !["going", "maybe", "not_going"].includes(value.response)
    || typeof value.guest_count !== "number" || !Number.isSafeInteger(value.guest_count) || value.guest_count < 0 || value.guest_count > 10
    || !(value.note === null || (typeof value.note === "string" && value.note.length <= 500))
    || (own === undefined && typeof value.is_current_user !== "boolean")) return null;
  return { id: value.id, event_id: value.event_id, respondent_name: value.respondent_name, response: value.response as EventRsvpPublic["response"], guest_count: value.guest_count,
    note: value.note as string | null, updated_at: value.updated_at as string, is_current_user: own ?? value.is_current_user as boolean };
}
export function eventCommentPublicRow(value: unknown): EventCommentPublic | null {
  if (!eventObject(value) || !eventUuid(value.id) || !eventUuid(value.event_id) || !name(value.author_name) || !stamp(value.created_at)
    || typeof value.body !== "string" || value.body.trim().length < 2 || value.body.length > 2000) return null;
  return { id: value.id, event_id: value.event_id, author_name: value.author_name, body: value.body, created_at: value.created_at as string };
}
// Parent policy check, child write and audit remain separate database calls.
// No retries, compensation or phantom audit after an uncertain write.
export async function eventParticipationWrite(options: {
  kind: ParticipationKind; familyId: string; eventId: string; actorId: string;
  write: () => Promise<unknown>; audit: (id: string) => Promise<unknown>; confirmedRejected: (error: unknown) => boolean;
}) {
  let row: EventRsvpPublic | EventCommentPublic;
  try {
    const rows = await options.write();
    if (!Array.isArray(rows) || rows.length !== 1 || !eventObject(rows[0]) || rows[0].family_id !== options.familyId
      || rows[0].event_id !== options.eventId || rows[0].auth_user_id !== options.actorId) throw new EventWriteOutcomeUnknownError();
    const projected = options.kind === "rsvp" ? eventRsvpPublicRow(rows[0], true) : eventCommentPublicRow(rows[0]);
    if (!projected) throw new EventWriteOutcomeUnknownError();
    row = projected;
  } catch (error) {
    if (options.confirmedRejected(error)) throw new EventWriteRejectedError();
    throw new EventWriteOutcomeUnknownError();
  }
  let auditPending = false;
  try { await options.audit(row.id); } catch { auditPending = true; console.error("Event participation write confirmed; audit pending."); }
  return { kind: options.kind, row, auditPending };
}
export function eventParticipationResponse(result: Awaited<ReturnType<typeof eventParticipationWrite>>) {
  return Response.json({ success: true, id: result.row.id, [result.kind === "rsvp" ? "rsvp" : "comment"]: result.row,
    ...(result.auditPending ? { code: "EVENT_PARTICIPATION_PENDING", auditPending: true } : {}) }, { status: result.auditPending ? 202 : result.kind === "rsvp" ? 200 : 201 });
}
export function eventParticipationAcknowledged(kind: ParticipationKind, eventId: string, body: Record<string, unknown>, status: number, raw: unknown) {
  if (!eventUuid(eventId) || !eventObject(raw) || raw.success !== true || !eventUuid(raw.id) || raw.outcomeUnknown === true
    || (Object.hasOwn(raw, "auditPending") && typeof raw.auditPending !== "boolean") || (status === 202) !== (raw.auditPending === true)
    || (status === 202 && raw.code !== "EVENT_PARTICIPATION_PENDING") || ![kind === "rsvp" ? 200 : 201, 202].includes(status)) return false;
  try {
    if (kind === "rsvp") {
      const row = eventRsvpPublicRow(raw.rsvp), record = eventRsvpRecord(body);
      return !!row && row.id === raw.id && row.event_id.toLowerCase() === eventId.toLowerCase() && row.is_current_user === true && row.response === record.response && row.guest_count === record.guest_count && row.note === record.note;
    }
    const row = eventCommentPublicRow(raw.comment);
    return !!row && row.id === raw.id && row.event_id.toLowerCase() === eventId.toLowerCase() && row.body === eventCommentRecord(body).body;
  } catch { return false; }
}
export function eventParticipationFeedback(path: string, status: number, payload: Record<string, unknown>, locale: "bn" | "en", method = "", body: Record<string, unknown> = {}) {
  const match = /^\/api\/events\/([0-9a-f-]+)\/(rsvp|comments)$/i.exec(path);
  if (!match) return null;
  const kind = match[2] === "rsvp" ? "rsvp" : "comment";
  if (status >= 500 || status === 408 || payload.outcomeUnknown === true || (status >= 200 && status < 300 && (method !== "POST" || !eventParticipationAcknowledged(kind, match[1], body, status, payload)))) return {
    kind: "info" as const, title: locale === "bn" ? "RSVP/মন্তব্যের ফল যাচাই প্রয়োজন" : "RSVP/comment outcome needs verification", message: eventErrorCopy("EVENT_PARTICIPATION_UNKNOWN", locale)!,
  };
  if (status === 202) return { kind: "info" as const, title: locale === "bn" ? "সংরক্ষিত; audit বাকি" : "Saved; audit pending", message: eventErrorCopy("EVENT_PARTICIPATION_PENDING", locale)! };
  return null;
}
export async function readEventParticipation(request: () => Promise<Response>, kind: ParticipationKind, eventId: string, body: Record<string, unknown>) {
  try {
    const response = await request();
    if (response.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await response.json().catch(() => null), payload = eventObject(raw) ? raw : {};
    if (response.status >= 500 || response.status === 408 || payload.outcomeUnknown === true) return { kind: "unknown" as const };
    if (!response.ok) return { kind: "rejected" as const, payload };
    if (!eventParticipationAcknowledged(kind, eventId, body, response.status, raw)) return { kind: "unknown" as const };
    return { kind: "confirmed" as const, rsvp: kind === "rsvp" ? eventRsvpPublicRow(payload.rsvp) : null, comment: kind === "comment" ? eventCommentPublicRow(payload.comment) : null, pending: payload.auditPending === true };
  } catch { return { kind: "unknown" as const }; }
}
