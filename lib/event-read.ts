import { eventObject } from "./event-validation.ts";
import { eventReadSnapshot, type EventPublicRow } from "./event-write-outcome.ts";
import { NoticeRequestGate } from "./notice-write-outcome.ts";
import { eventRsvpPublicRow, eventCommentPublicRow } from "./event-participation.ts";
import { eventMediaPublicRow } from "./event-media-workflow.ts";

export type EventSnapshot = NonNullable<ReturnType<typeof eventReadSnapshot>>;
export class EventReadError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "EventReadError"; }
}
export function eventSafeSnapshot(raw: unknown): EventSnapshot | null {
  const snapshot = eventReadSnapshot(raw);
  if (!snapshot || (!snapshot.permissions.canManage && snapshot.events.some(row => row.status === "draft"))) return null;
  if (!eventObject(raw) || ["rsvps", "comments", "media"].some(k => (raw[k] as unknown[]).some(row => eventObject(row) && Object.hasOwn(row, "family_id") && row.family_id !== snapshot.family.id))) return null;
  const own = new Set<string>();
  for (const row of snapshot.rsvps) {
    if (!eventRsvpPublicRow(row)) return null;
    if (row.is_current_user) {
      if (own.has(row.event_id.toLowerCase())) return null;
      own.add(row.event_id.toLowerCase());
    }
  }
  if (snapshot.comments.some(row => !eventCommentPublicRow(row)) || snapshot.media.some(row => !eventMediaPublicRow(row))) return null;
  return snapshot;
}
export function eventEditorStillAvailable(snapshot: EventSnapshot, editor: Pick<EventPublicRow, "id" | "updated_at" | "status"> | null) {
  return !snapshot.migrationRequired && snapshot.permissions.canManage
    && (!editor || snapshot.events.some(row => row.id.toLowerCase() === editor.id.toLowerCase() && row.updated_at === editor.updated_at && row.status === editor.status));
}
// Explicit GET only. The shared deadline covers fetch and JSON even when abort
// is ignored. Obsolete/unmounted callbacks never update state or unlock writes.
export async function readEvents(options: {
  gate: NoticeRequestGate; request: (init: RequestInit) => Promise<Response>; expectedFamilyId?: string; timeoutMs?: number;
  start: () => void; loaded: (snapshot: EventSnapshot) => void; setup: () => void;
  failed: (error: EventReadError) => void; settled: () => void;
}): Promise<boolean> {
  const ticket = options.gate.begin(), signal = ticket.controller.signal;
  options.start();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new EventReadError("EVENT_LOAD_TIMEOUT")); ticket.controller.abort(); }, options.timeoutMs ?? 25000);
  });
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new EventReadError("EVENT_LOAD_FAILED"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    const response = await Promise.race([options.request({ cache: "no-store", signal }), deadline, aborted]);
    if (!options.gate.current(ticket)) return false;
    if (response.status === 401 || response.status === 403) throw new EventReadError(response.status === 401 ? "EVENT_SIGN_IN_REQUIRED" : "EVENT_ACCESS_DENIED");
    if (response.status === 413) throw new EventReadError("EVENTS_ROW_LIMIT");
    const raw: unknown = await Promise.race([
      response.json().catch(() => { throw new EventReadError(response.ok ? "EVENT_INVALID_SNAPSHOT" : "EVENT_BACKEND_UNAVAILABLE"); }), deadline, aborted,
    ]);
    if (!options.gate.current(ticket)) return false;
    if (response.status === 409 && eventObject(raw) && raw.code === "FAMILY_SETUP_REQUIRED") { options.setup(); return false; }
    if (!response.ok) throw new EventReadError(eventObject(raw) && raw.code === "EVENT_INVALID_SNAPSHOT" ? "EVENT_INVALID_SNAPSHOT" : "EVENT_BACKEND_UNAVAILABLE");
    const snapshot = eventSafeSnapshot(raw);
    if (!snapshot) throw new EventReadError("EVENT_INVALID_SNAPSHOT");
    if (options.expectedFamilyId && snapshot.family.id.toLowerCase() !== options.expectedFamilyId.toLowerCase()) throw new EventReadError("EVENT_FAMILY_CHANGED");
    if (!options.gate.current(ticket)) return false;
    options.loaded(snapshot);
    return !snapshot.migrationRequired;
  } catch (error) {
    if (options.gate.current(ticket)) options.failed(error instanceof EventReadError ? error : new EventReadError("EVENT_LOAD_FAILED"));
    return false;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    if (options.gate.current(ticket)) options.settled();
  }
}
