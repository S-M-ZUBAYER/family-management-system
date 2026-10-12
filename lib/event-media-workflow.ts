import { eventObject, eventUuid, eventTimestamp, eventErrorCopy, EventValidationError } from "./event-validation.ts";
import { eventCapturedMediaKeys, EventWriteOutcomeUnknownError, EventWriteRejectedError, type EventMediaPublic } from "./event-write-outcome.ts";
import { magazineCoverHeaderMatches } from "./magazine-cover-policy.ts";

const extensions: Record<string, readonly string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/gif": ["gif"], "video/mp4": ["mp4"], "video/webm": ["webm"] };
export function eventMediaMetadata(file: { name: string; type: string; size: number }) {
  if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 220 || /[\x00-\x1f\x7f/\\]/.test(file.name)
    || typeof file.type !== "string" || !Object.hasOwn(extensions, file.type) || !Number.isSafeInteger(file.size) || file.size < 1
    || file.size > (file.type.startsWith("video/") ? 25 : 8) * 1024 * 1024) throw new EventValidationError("EVENT_MEDIA_INVALID_FILE");
  const suffix = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : null;
  if (suffix !== null && !extensions[file.type].includes(suffix)) throw new EventValidationError("EVENT_MEDIA_INVALID_FILE");
  return { name: file.name, type: file.type, size: file.size, extension: extensions[file.type][0] };
}
export function eventMediaCaption(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 500) throw new EventValidationError("EVENT_MEDIA_INVALID_CAPTION");
  return value.trim() || null;
}
// At most 4 KiB of headers. This is not full media decoding or malware scanning.
export function eventMediaHeaderMatches(type: string, bytes: Uint8Array, size: number) {
  if (type.startsWith("image/")) return magazineCoverHeaderMatches(type, bytes, size);
  if (type === "video/mp4") return size >= 16 && bytes.length >= 16 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp"
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) >= 16
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) <= size;
  if (type === "video/webm") {
    if (size < 12 || bytes.length < 12 || ![26, 69, 223, 163].every((v, i) => bytes[i] === v)) return false;
    // EBML header size is a bounded, finite VINT; inspect DocType only within it.
    let length = 1; while (length <= 8 && !(bytes[4] & (128 >> (length - 1)))) length++;
    if (length > 4 || bytes.length < 4 + length) return false;
    let headerSize = bytes[4] & ((128 >> (length - 1)) - 1);
    for (let i = 1; i < length; i++) headerSize = headerSize * 256 + bytes[4 + i];
    const end = 4 + length + headerSize;
    if (headerSize < 7 || end > Math.min(bytes.length, size, 4096)) return false;
    for (let i = 4 + length; i + 7 <= end; i++) if (bytes[i] === 66 && bytes[i + 1] === 130 && bytes[i + 2] === 132
      && String.fromCharCode(...bytes.subarray(i + 3, i + 7)) === "webm") return true;
  }
  return false;
}
export async function validateEventMedia(file: File) {
  const metadata = eventMediaMetadata(file);
  if (!eventMediaHeaderMatches(metadata.type, new Uint8Array(await file.slice(0, 4096).arrayBuffer()), metadata.size)) throw new EventValidationError("EVENT_MEDIA_INVALID_FILE");
  return metadata;
}
export function eventMediaPublicRow(raw: unknown): EventMediaPublic | null {
  if (!eventObject(raw) || !eventUuid(raw.id) || !eventUuid(raw.event_id) || typeof raw.uploader_name !== "string" || !raw.uploader_name.trim() || raw.uploader_name.length > 180
    || !(raw.caption === null || (typeof raw.caption === "string" && raw.caption.length <= 500)) || typeof raw.created_at !== "string") return null;
  try { eventMediaMetadata({ name: raw.file_name as string, type: raw.mime_type as string, size: raw.file_size as number }); eventTimestamp(raw.created_at, true); } catch { return null; }
  return { id: raw.id, event_id: raw.event_id, file_name: raw.file_name as string, mime_type: raw.mime_type as string, file_size: raw.file_size as number,
    caption: raw.caption as string | null, uploader_name: raw.uploader_name, created_at: raw.created_at };
}
export class EventMediaPrewriteError extends Error {
  readonly cleanupPending: boolean;
  constructor(cleanupPending: boolean) { super(cleanupPending ? "EVENT_MEDIA_UNLINKED_PENDING" : "EVENT_MEDIA_UPLOAD_REJECTED"); this.name = "EventMediaPrewriteError"; this.cleanupPending = cleanupPending; }
}
async function discardUnlinked(discard: () => Promise<unknown>) {
  try { await discard(); return false; } catch { console.error("Unlinked event media cleanup needs reconciliation."); return true; }
}
// Never remove an object after an ambiguous metadata insert: its row may exist.
export async function eventMediaUploadWrite(options: {
  familyId: string; eventId: string; actorId: string; key: string; file: ReturnType<typeof eventMediaMetadata>; caption: string | null;
  put: () => Promise<unknown>; create: () => Promise<unknown>; discard: () => Promise<unknown>; confirmedRejected: (error: unknown) => boolean; audit: (id: string) => Promise<unknown>;
}) {
  eventCapturedMediaKeys([{ storage_key: options.key }], options.familyId, options.eventId);
  try { await options.put(); } catch { throw new EventMediaPrewriteError(await discardUnlinked(options.discard)); }
  let media: EventMediaPublic;
  try {
    const rows = await options.create(), row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    const projected = eventMediaPublicRow(row);
    if (!eventObject(row) || row.family_id !== options.familyId || row.event_id !== options.eventId || row.uploaded_by_user_id !== options.actorId || row.storage_key !== options.key
      || !projected || projected.file_name !== options.file.name || projected.mime_type !== options.file.type || projected.file_size !== options.file.size || projected.caption !== options.caption) throw new EventWriteOutcomeUnknownError();
    media = projected;
  } catch (error) {
    if (options.confirmedRejected(error)) {
      if (await discardUnlinked(options.discard)) throw new EventMediaPrewriteError(true);
      throw new EventWriteRejectedError();
    }
    throw new EventWriteOutcomeUnknownError();
  }
  let auditPending = false;
  try { await options.audit(media.id); } catch { auditPending = true; console.error("Event media saved; audit pending."); }
  return { id: media.id, media, auditPending, cleanupPending: false };
}
export async function eventMediaDeleteWrite(options: {
  id: string; familyId: string; eventId: string; key: string; write: () => Promise<unknown>; cleanup: () => Promise<unknown>;
  confirmedRejected: (error: unknown) => boolean; audit: (cleanupPending: boolean) => Promise<unknown>;
}) {
  eventCapturedMediaKeys([{ storage_key: options.key }], options.familyId, options.eventId);
  try {
    const rows = await options.write();
    if (Array.isArray(rows) && rows.length === 0) throw new EventValidationError("EVENT_RECORD_CHANGED");
    if (!Array.isArray(rows) || rows.length !== 1 || !eventObject(rows[0]) || rows[0].id !== options.id || rows[0].family_id !== options.familyId
      || rows[0].event_id !== options.eventId || rows[0].storage_key !== options.key) throw new EventWriteOutcomeUnknownError();
  } catch (error) {
    if (error instanceof EventValidationError) throw error;
    if (options.confirmedRejected(error)) throw new EventWriteRejectedError();
    throw new EventWriteOutcomeUnknownError();
  }
  let cleanupPending = false, auditPending = false;
  try { await options.cleanup(); } catch { cleanupPending = true; console.error("Event media access removed; object cleanup pending."); }
  try { await options.audit(cleanupPending); } catch { auditPending = true; console.error("Event media access removed; audit pending."); }
  return { id: options.id, media: null, auditPending, cleanupPending };
}
export function eventMediaResponse(result: { id: string; media: EventMediaPublic | null; auditPending: boolean; cleanupPending: boolean }) {
  const pending = result.auditPending || result.cleanupPending;
  return Response.json({ success: true, id: result.id, ...(result.media ? { media: result.media } : {}),
    ...(pending ? { code: "EVENT_MEDIA_PENDING", auditPending: result.auditPending, cleanupPending: result.cleanupPending } : {}) }, { status: pending ? 202 : result.media ? 201 : 200 });
}
export function eventMediaPrewriteResponse(error: EventMediaPrewriteError) {
  return Response.json({ code: error.message, error: eventErrorCopy(error.message, "en"), ...(error.cleanupPending ? { cleanupPending: true } : {}) }, { status: 503 });
}
export function eventMediaExpected(path: string, method: string, body?: BodyInit | null) {
  const upload = /^\/api\/events\/([0-9a-f-]+)\/media$/i.exec(path), deletion = /^\/api\/event-media\/([0-9a-f-]+)$/i.exec(path);
  if (method === "DELETE" && deletion && eventUuid(deletion[1])) return { method, id: deletion[1], file: null, caption: null };
  if (method !== "POST" || !upload || !eventUuid(upload[1]) || !(body instanceof FormData)) return null;
  try {
    const file = body.get("file");
    if (!(file instanceof File) || body.getAll("file").length !== 1 || body.getAll("caption").length > 1) return null;
    return { method, id: upload[1], file: eventMediaMetadata(file), caption: eventMediaCaption(body.get("caption")) };
  } catch { return null; }
}
export function eventMediaAcknowledged(expected: ReturnType<typeof eventMediaExpected>, status: number, raw: unknown) {
  if (!expected || !eventObject(raw) || raw.success !== true || !eventUuid(raw.id) || raw.outcomeUnknown === true
    || ["auditPending", "cleanupPending"].some(k => Object.hasOwn(raw, k) && typeof raw[k] !== "boolean")
    || (status === 202) !== (raw.auditPending === true || raw.cleanupPending === true) || (status === 202 && raw.code !== "EVENT_MEDIA_PENDING")) return false;
  if (expected.method === "DELETE") return [200, 202].includes(status) && raw.id.toLowerCase() === expected.id.toLowerCase();
  const media = eventMediaPublicRow(raw.media);
  return [201, 202].includes(status) && !!media && !!expected.file && raw.cleanupPending !== true && media.id === raw.id && media.event_id.toLowerCase() === expected.id.toLowerCase()
    && media.file_name === expected.file.name && media.mime_type === expected.file.type && media.file_size === expected.file.size && media.caption === expected.caption;
}
export function eventMediaFeedback(path: string, status: number, payload: Record<string, unknown>, locale: "bn" | "en", method = "", body?: BodyInit | null) {
  if (!/^\/api\/events\/[0-9a-f-]+\/media$|^\/api\/event-media\/[0-9a-f-]+$/i.test(path)) return null;
  if (status === 413) return { kind: "error" as const, title: locale === "bn" ? "File বা request বেশি বড়" : "File or request too large", message: eventErrorCopy("EVENT_MEDIA_INVALID_FILE", locale)! };
  if (payload.code === "EVENT_MEDIA_STORAGE_UNAVAILABLE" || payload.code === "EVENT_MEDIA_UPLOAD_REJECTED") return {
    kind: "error" as const, title: locale === "bn" ? "মিডিয়া সংরক্ষণ হয়নি" : "Media was not saved", message: eventErrorCopy(payload.code, locale)!,
  };
  if (payload.code === "EVENT_MEDIA_UNLINKED_PENDING") return { kind: "info" as const, title: locale === "bn" ? "অব্যবহৃত file cleanup বাকি" : "Unlinked file cleanup pending", message: eventErrorCopy(payload.code, locale)! };
  if (status >= 500 || status === 408 || payload.outcomeUnknown === true || (status >= 200 && status < 300 && !eventMediaAcknowledged(eventMediaExpected(path, method, body), status, payload))) return {
    kind: "info" as const, title: locale === "bn" ? "মিডিয়ার ফল যাচাই প্রয়োজন" : "Media outcome needs verification", message: eventErrorCopy("EVENT_MEDIA_UNKNOWN", locale)!,
  };
  if (status === 202) return { kind: "info" as const, title: locale === "bn" ? "মিডিয়ার পরিবর্তন সংরক্ষিত; কাজ বাকি" : "Media change saved; work pending", message: eventErrorCopy("EVENT_MEDIA_PENDING", locale)! };
  return null;
}
export async function readEventMediaMutation(request: () => Promise<Response>, path: string, method: string, body?: BodyInit | null) {
  try {
    const response = await request(); if (response.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await response.json().catch(() => null), payload = eventObject(raw) ? raw : {};
    if (response.status === 413) return { kind: "rejected" as const, payload: { code: "EVENT_MEDIA_INVALID_FILE" } };
    if (payload.code === "EVENT_MEDIA_STORAGE_UNAVAILABLE" || payload.code === "EVENT_MEDIA_UPLOAD_REJECTED") return { kind: "rejected" as const, payload };
    if (response.status >= 500 || response.status === 408 || payload.outcomeUnknown === true || payload.code === "EVENT_MEDIA_UNLINKED_PENDING") return { kind: "unknown" as const, payload };
    if (!response.ok) return { kind: "rejected" as const, payload };
    if (!eventMediaAcknowledged(eventMediaExpected(path, method, body), response.status, raw)) return { kind: "unknown" as const, payload };
    return { kind: "confirmed" as const, media: eventMediaPublicRow(payload.media), pending: payload.auditPending === true || payload.cleanupPending === true };
  } catch { return { kind: "unknown" as const, payload: {} }; }
}
