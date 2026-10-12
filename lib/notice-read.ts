import { noticeObject } from "./notice-validation.ts";
import { noticeReadSnapshot, NoticeRequestGate, type NoticePublicRow } from "./notice-write-outcome.ts";

export type NoticeSnapshot = NonNullable<ReturnType<typeof noticeReadSnapshot>>;
export class NoticeReadError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "NoticeReadError"; }
}

export function noticeEditorStillAvailable(snapshot: NoticeSnapshot, editor: Pick<NoticePublicRow, "id" | "updated_at"> | null) {
  return !snapshot.migrationRequired && snapshot.permissions.canManage
    && (!editor || snapshot.notices.some(row => row.id === editor.id && row.updated_at === editor.updated_at));
}

// Explicit GET callers only. No automatic read retry or mutation resubmission.
// The deadline covers both fetch and JSON, even if they ignore AbortSignal.
export async function readNotices(options: {
  gate: NoticeRequestGate; request: (init: RequestInit) => Promise<Response>;
  expectedFamilyId?: string; timeoutMs?: number;
  start: () => void; loaded: (snapshot: NoticeSnapshot) => void; setup: () => void;
  failed: (error: NoticeReadError) => void; settled: () => void;
}): Promise<boolean> {
  const ticket = options.gate.begin(), signal = ticket.controller.signal;
  options.start();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new NoticeReadError("NOTICE_LOAD_TIMEOUT")); ticket.controller.abort(); }, options.timeoutMs ?? 25000);
  });
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new NoticeReadError("NOTICE_LOAD_FAILED"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    const response = await Promise.race([options.request({ cache: "no-store", signal }), deadline, aborted]);
    if (!options.gate.current(ticket)) return false;
    if (response.status === 401 || response.status === 403) throw new NoticeReadError(response.status === 401 ? "NOTICE_SIGN_IN_REQUIRED" : "NOTICE_ACCESS_DENIED");
    if (response.status === 413) throw new NoticeReadError("NOTICES_ROW_LIMIT");
    const raw: unknown = await Promise.race([
      response.json().catch(() => { throw new NoticeReadError(response.ok ? "NOTICE_INVALID_SNAPSHOT" : "NOTICE_BACKEND_UNAVAILABLE"); }), deadline, aborted,
    ]);
    if (!options.gate.current(ticket)) return false;
    if (response.status === 409 && noticeObject(raw) && raw.code === "FAMILY_SETUP_REQUIRED") { options.setup(); return false; }
    if (!response.ok) throw new NoticeReadError(noticeObject(raw) && raw.code === "NOTICE_INVALID_SNAPSHOT" ? "NOTICE_INVALID_SNAPSHOT" : "NOTICE_BACKEND_UNAVAILABLE");
    const snapshot = noticeReadSnapshot(raw);
    if (!snapshot) throw new NoticeReadError("NOTICE_INVALID_SNAPSHOT");
    if (options.expectedFamilyId && snapshot.family.id.toLowerCase() !== options.expectedFamilyId.toLowerCase()) throw new NoticeReadError("NOTICE_FAMILY_CHANGED");
    if (!options.gate.current(ticket)) return false;
    options.loaded(snapshot);
    return !snapshot.migrationRequired;
  } catch (error) {
    if (options.gate.current(ticket)) options.failed(error instanceof NoticeReadError ? error : new NoticeReadError("NOTICE_LOAD_FAILED"));
    return false;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    if (options.gate.current(ticket)) options.settled();
  }
}
