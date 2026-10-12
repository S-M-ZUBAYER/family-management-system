import { eventObject, eventUuid, eventRecord, eventTimestamp, eventTypes, eventStatuses, eventStatusByAction, eventErrorCopy, EventValidationError } from "./event-validation.ts";
export type EventPublicRow = {
  id: string; title_bn: string; title_en: string | null; description_bn: string; description_en: string | null;
  event_type: "reunion" | "tour" | "wedding" | "religious" | "meeting" | "other"; start_at: string; end_at: string | null;
  venue: string; city: string | null; meeting_point: string | null; estimated_cost_per_person: number | string; total_budget: number | string;
  capacity: number | null; registration_deadline: string | null; status: "draft" | "published" | "registration_closed" | "completed" | "cancelled"; created_at: string; updated_at: string;
};
export function eventPublicRow(value: unknown): EventPublicRow | null {
  if (!eventObject(value) || !eventUuid(value.id) || typeof value.event_type !== "string" || !(eventTypes as readonly string[]).includes(value.event_type)
    || typeof value.status !== "string" || !(eventStatuses as readonly string[]).includes(value.status)) return null;
  // Database nulls and required timestamps are not silently defaulted/coerced.
  const optional = ["title_en", "description_en", "city", "meeting_point", "end_at", "registration_deadline"];
  const bounds: Record<string, number> = { title_bn: 180, title_en: 180, description_bn: 5000, description_en: 5000, venue: 220, city: 120, meeting_point: 220 };
  if (Object.entries(bounds).some(([key, max]) => value[key] !== null && (typeof value[key] !== "string" || (value[key] as string).length > max))
    || ["end_at", "registration_deadline"].some(key => value[key] !== null && (typeof value[key] !== "string" || !(value[key] as string).trim()))) return null;
  if (optional.some(key => value[key] !== null && typeof value[key] !== "string")
    || (value.capacity !== null && (typeof value.capacity !== "number" || !Number.isSafeInteger(value.capacity)))
    || ["estimated_cost_per_person", "total_budget"].some(key => !["number", "string"].includes(typeof value[key]) || value[key] === "")) return null;
  try {
    eventRecord({ titleBn: value.title_bn, titleEn: value.title_en, descriptionBn: value.description_bn, descriptionEn: value.description_en,
      eventType: value.event_type, status: value.status, startAt: value.start_at, endAt: value.end_at, venue: value.venue, city: value.city, meetingPoint: value.meeting_point,
      estimatedCostPerPerson: value.estimated_cost_per_person, totalBudget: value.total_budget, capacity: value.capacity, registrationDeadline: value.registration_deadline }, true);
    eventTimestamp(value.created_at, true); eventTimestamp(value.updated_at, true);
  } catch { return null; }
  return Object.fromEntries(["id", "title_bn", "title_en", "description_bn", "description_en", "event_type", "start_at", "end_at", "venue", "city", "meeting_point", "estimated_cost_per_person", "total_budget", "capacity", "registration_deadline", "status", "created_at", "updated_at"].map(key => [key, value[key]])) as EventPublicRow;
}
export class EventWriteOutcomeUnknownError extends Error { constructor() { super("EVENT_WRITE_OUTCOME_UNKNOWN"); this.name = "EventWriteOutcomeUnknownError"; } }
export function eventCapturedMediaKeys(rows: unknown, family: string, id: string): string[] {
  if (!Array.isArray(rows)) throw new EventValidationError("EVENT_DELETE_UNAVAILABLE");
  const keys = new Set<string>();
  for (const row of rows) {
    if (!eventObject(row) || typeof row.storage_key !== "string" || row.storage_key.length > 1024) throw new EventValidationError("EVENT_DELETE_UNAVAILABLE");
    const parts = row.storage_key.split("/");
    if (parts.length !== 5 || parts[0] !== "families" || parts[1].toLowerCase() !== family.toLowerCase() || parts[2] !== "events" || parts[3].toLowerCase() !== id.toLowerCase()
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]+$/i.test(parts[4])) throw new EventValidationError("EVENT_DELETE_UNAVAILABLE");
    keys.add(row.storage_key);
  }
  return [...keys];
}
export class EventWriteRejectedError extends Error { constructor() { super("EVENT_WRITE_REJECTED"); this.name = "EventWriteRejectedError"; } }
export async function eventWrite(options: { write: () => Promise<unknown>; expectedId?: string; deletion?: boolean; confirmedRejected: (error: unknown) => boolean; audit: (id: string) => Promise<unknown>; cleanup?: () => Promise<unknown> }) {
  let id: string, event: EventPublicRow | null = null;
  try {
    const rows = await options.write();
    if (Array.isArray(rows) && rows.length === 0 && options.expectedId) throw new EventValidationError("EVENT_RECORD_CHANGED");
    if (!Array.isArray(rows) || rows.length !== 1 || !eventObject(rows[0]) || !eventUuid(rows[0].id) || (options.expectedId && rows[0].id.toLowerCase() !== options.expectedId.toLowerCase())) throw new EventWriteOutcomeUnknownError();
    id = rows[0].id;
    if (!options.deletion) { event = eventPublicRow(rows[0]); if (!event) throw new EventWriteOutcomeUnknownError(); }
  } catch (error) {
    if (error instanceof EventValidationError) throw error;
    if (options.confirmedRejected(error)) throw new EventWriteRejectedError();
    throw new EventWriteOutcomeUnknownError();
  }
  let auditPending = false, cleanupPending = false;
  if (options.cleanup) try { await options.cleanup(); } catch { cleanupPending = true; console.error("Event write confirmed; private media cleanup pending."); }
  try { await options.audit(id); } catch { auditPending = true; console.error("Event write confirmed; audit pending."); }
  return { id, event, auditPending, cleanupPending };
}
export function eventWriteResponse(result: Awaited<ReturnType<typeof eventWrite>>, status = 200) {
  const pending = result.auditPending || result.cleanupPending;
  return Response.json({ success: true, id: result.id, ...(result.event ? { event: result.event } : {}),
    ...(pending ? { code: "EVENT_WRITE_PENDING", auditPending: result.auditPending, cleanupPending: result.cleanupPending } : {}) }, { status: pending ? 202 : status });
}
export function eventMutationAcknowledged(method: string, id: string | undefined, body: Record<string, unknown>, status: number, raw: unknown) {
  if (!eventObject(raw) || raw.success !== true || !eventUuid(raw.id) || raw.outcomeUnknown === true
    || ["auditPending", "cleanupPending"].some(key => Object.hasOwn(raw, key) && typeof raw[key] !== "boolean")
    || (status === 202) !== (raw.auditPending === true || raw.cleanupPending === true)
    || (status === 202 && raw.code !== "EVENT_WRITE_PENDING") || (id && raw.id.toLowerCase() !== id.toLowerCase())) return false;
  if (method === "DELETE") return !!id && [200, 202].includes(status);
  const event = eventPublicRow(raw.event);
  if (!event || event.id !== raw.id || raw.cleanupPending === true) return false;
  const matchesRecord = (input: unknown, editing: boolean) => {
    try {
      return Object.entries(eventRecord(input, editing)).every(([key, expected]) => {
        const actual = (event as unknown as Record<string, unknown>)[key];
        if (["estimated_cost_per_person", "total_budget"].includes(key)) return Number(actual) === expected;
        if (["start_at", "end_at", "registration_deadline"].includes(key) && expected !== null) return typeof actual === "string" && Date.parse(actual) === Date.parse(expected as string);
        return actual === expected;
      });
    } catch { return false; }
  };
  if (method === "POST") return [201, 202].includes(status) && matchesRecord(body, false);
  if (method !== "PATCH" || !id || ![200, 202].includes(status) || typeof body.action !== "string") return false;
  return body.action === "edit" ? matchesRecord(body.data, true)
    : Object.hasOwn(eventStatusByAction, body.action) && event.status === eventStatusByAction[body.action];
}
export function eventWriteFeedback(path: string, status: number, payload: Record<string, unknown>, locale: "bn" | "en", method = "", body: Record<string, unknown> = {}) {
  const match = /^\/api\/events(?:\/([0-9a-f-]+))?$/i.exec(path);
  if (!match) return null;
  if (status >= 500 || status === 408 || payload.outcomeUnknown === true || (status >= 200 && status < 300 && !eventMutationAcknowledged(method, match[1], body, status, payload))) return {
    kind: "info" as const, title: locale === "bn" ? "ইভেন্টের ফল যাচাই প্রয়োজন" : "Event outcome needs verification", message: eventErrorCopy("EVENT_WRITE_OUTCOME_UNKNOWN", locale)!,
  };
  if (status === 202) return { kind: "info" as const, title: locale === "bn" ? "পরিবর্তন সংরক্ষিত; কিছু কাজ বাকি" : "Change saved; some work pending", message: eventErrorCopy("EVENT_WRITE_PENDING", locale)! };
  return null;
}
export async function readEventMutation(request: () => Promise<Response>, method: string, id: string | undefined, body: Record<string, unknown>) {
  try {
    const response = await request();
    if (response.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await response.json().catch(() => null), payload = eventObject(raw) ? raw : {};
    if (response.status >= 500 || response.status === 408 || payload.outcomeUnknown === true) return { kind: "unknown" as const, payload };
    if (!response.ok) return { kind: "rejected" as const, payload };
    if (!eventMutationAcknowledged(method, id, body, response.status, raw)) return { kind: "unknown" as const, payload };
    return { kind: "confirmed" as const, payload, event: eventPublicRow(payload.event), pending: payload.auditPending === true || payload.cleanupPending === true };
  } catch { return { kind: "unknown" as const, payload: {} }; }
}

export type EventRsvpPublic = { id: string; event_id: string; is_current_user: boolean; respondent_name: string; response: "going" | "maybe" | "not_going"; guest_count: number; note: string | null; updated_at: string };
export type EventCommentPublic = { id: string; event_id: string; author_name: string; body: string; created_at: string };
export type EventMediaPublic = { id: string; event_id: string; file_name: string; mime_type: string; file_size: number; caption: string | null; uploader_name: string; created_at: string };
const validText = (v: unknown, max: number, nullable = false) => (nullable && v === null) || (typeof v === "string" && v.length <= max && (nullable || !!v.trim()));
const validStamp = (v: unknown) => { try { return typeof v === "string" && !!eventTimestamp(v, true); } catch { return false; } };
const project = (v: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map(k => [k, v[k]]));
// A reload may unlock a prior uncertain write only from a complete scoped list.
export function eventReadSnapshot(raw: unknown, expectedFamilyId?: string) {
  if (!eventObject(raw) || !eventObject(raw.family) || !eventUuid(raw.family.id) || !validText(raw.family.name_bn, 300) || !validText(raw.family.name_en, 300, true)
    || (expectedFamilyId && raw.family.id.toLowerCase() !== expectedFamilyId.toLowerCase())
    || !eventObject(raw.permissions) || typeof raw.permissions.canManage !== "boolean" || typeof raw.migrationRequired !== "boolean"
    || ["events", "rsvps", "comments", "media"].some(k => !Array.isArray(raw[k]) || (raw[k] as unknown[]).length > 20000)) return null;
  const events: EventPublicRow[] = [], ids = new Set<string>();
  for (const v of raw.events as unknown[]) {
    const row = eventPublicRow(v);
    if (!row || ids.has(row.id.toLowerCase()) || (eventObject(v) && Object.hasOwn(v, "family_id") && v.family_id !== raw.family.id)) return null;
    ids.add(row.id.toLowerCase()); events.push(row);
  }
  const child = (values: unknown[], kind: "rsvp" | "comment" | "media") => {
    const seen = new Set<string>(), output: Record<string, unknown>[] = [];
    for (const v of values) {
      if (!eventObject(v) || !eventUuid(v.id) || !eventUuid(v.event_id) || seen.has(v.id.toLowerCase()) || !ids.has(v.event_id.toLowerCase())) return null;
      seen.add(v.id.toLowerCase());
      if (kind === "rsvp") {
        if (typeof v.is_current_user !== "boolean" || !validText(v.respondent_name, 600) || typeof v.response !== "string" || !["going", "maybe", "not_going"].includes(v.response)
          || typeof v.guest_count !== "number" || !Number.isSafeInteger(v.guest_count) || v.guest_count < 0 || v.guest_count > 10000 || !validText(v.note, 5000, true) || !validStamp(v.updated_at)) return null;
        output.push(project(v, ["id", "event_id", "is_current_user", "respondent_name", "response", "guest_count", "note", "updated_at"]));
      } else if (kind === "comment") {
        if (!validText(v.author_name, 600) || !validText(v.body, 10000) || !validStamp(v.created_at)) return null;
        output.push(project(v, ["id", "event_id", "author_name", "body", "created_at"]));
      } else {
        if (!validText(v.file_name, 500) || typeof v.mime_type !== "string" || !["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"].includes(v.mime_type)
          || typeof v.file_size !== "number" || !Number.isSafeInteger(v.file_size) || v.file_size < 1 || v.file_size > 25 * 1024 * 1024 || !validText(v.caption, 5000, true) || !validText(v.uploader_name, 600) || !validStamp(v.created_at)) return null;
        output.push(project(v, ["id", "event_id", "file_name", "mime_type", "file_size", "caption", "uploader_name", "created_at"]));
      }
    }
    return output;
  };
  const rsvps = child(raw.rsvps as unknown[], "rsvp"), comments = child(raw.comments as unknown[], "comment"), media = child(raw.media as unknown[], "media");
  if (!rsvps || !comments || !media || (raw.migrationRequired && (events.length || rsvps.length || comments.length || media.length))) return null;
  return { family: { id: raw.family.id, name_bn: raw.family.name_bn as string, name_en: raw.family.name_en as string | null }, events,
    rsvps: rsvps as EventRsvpPublic[], comments: comments as EventCommentPublic[], media: media as EventMediaPublic[],
    permissions: { canManage: raw.permissions.canManage }, migrationRequired: raw.migrationRequired };
}
