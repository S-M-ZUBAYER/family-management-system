import { noticeObject, noticeUuid } from "./notice-validation.ts";
import { healthDate, healthTimestamp } from "./health-validation.ts";
import { healthRecordsEqual } from "./health-record-write.ts";
import { chatAttachmentHeaderMatches } from "./chat-attachment-policy.ts";
import type { HealthDocument } from "./health-types.ts";

export const healthDocumentLimit = 12 * 1024 * 1024;
const types: Record<string, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "application/pdf": ["pdf"], "application/msword": ["doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"] };
const categories = ["prescription", "lab_report", "imaging", "vaccine", "insurance", "other"];
const fields = ["id", "file_name", "mime_type", "file_size", "category", "title", "document_date", "notes", "created_at"];
export class HealthDocumentError extends Error {
  readonly code: string; readonly status: number; readonly operationId?: string;
  constructor(code: string, status = 400, operationId?: string) { super(code); this.code = code; this.status = status; this.operationId = operationId; }
}
export type HealthDocumentScope = { familyId: string; actorId: string };
export function healthDocumentScope(raw: unknown, actual?: HealthDocumentScope): HealthDocumentScope {
  if (!noticeObject(raw) || !noticeUuid(raw.familyId) || typeof raw.actorId !== "string" || !raw.actorId || raw.actorId.length > 240 || /[\u0000-\u001f\u007f/\\]/.test(raw.actorId) || actual && (raw.familyId !== actual.familyId || raw.actorId !== actual.actorId)) throw new HealthDocumentError("HEALTH_DOC_CONTEXT", 409);
  return { familyId: raw.familyId, actorId: raw.actorId };
}
export function healthDocumentMetadata(file: { name: string; type: string; size: number }) {
  if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 220 || /[\u0000-\u001f\u007f/\\]/.test(file.name) || !Object.hasOwn(types, file.type) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > healthDocumentLimit) throw new HealthDocumentError("HEALTH_DOC_FILE");
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : null;
  if (ext !== null && !types[file.type].includes(ext)) throw new HealthDocumentError("HEALTH_DOC_FILE");
  return { name: file.name, type: file.type, size: file.size, extension: types[file.type][0] };
}
export function healthDocumentInput(form: FormData, actual?: HealthDocumentScope) {
  const allowed = ["file", "title", "category", "documentDate", "notes", "expectedFamilyId", "expectedActorId"];
  for (const key of form.keys()) if (!allowed.includes(key) || form.getAll(key).length !== 1) throw new HealthDocumentError("HEALTH_DOC_INPUT");
  const scope = healthDocumentScope({ familyId: form.get("expectedFamilyId"), actorId: form.get("expectedActorId") }, actual);
  const file = form.get("file"); if (!(file instanceof File)) throw new HealthDocumentError("HEALTH_DOC_FILE");
  const metadata = healthDocumentMetadata(file), title = form.get("title"), category = form.get("category"), notes = form.get("notes"), date = form.get("documentDate");
  if (!(title === null || typeof title === "string" && title.trim().length <= 180) || !(notes === null || typeof notes === "string" && notes.trim().length <= 2000) || !(category === null || typeof category === "string" && categories.includes(category)) || !(date === null || typeof date === "string") || healthDate(date) === undefined) throw new HealthDocumentError("HEALTH_DOC_INPUT");
  return { scope, file, metadata, title: typeof title === "string" && title.trim() ? title.trim() : metadata.name.slice(0, 180), category: category ?? "other", notes: typeof notes === "string" ? notes.trim() || null : null, documentDate: healthDate(date) ?? null };
}
export async function healthDocumentHeader(file: File) {
  const metadata = healthDocumentMetadata(file);
  // Bounded header/container screening only; not malware scanning or Office subtype validation.
  if (!chatAttachmentHeaderMatches(metadata.type, new Uint8Array(await file.slice(0, 4096).arrayBuffer()), metadata.size)) throw new HealthDocumentError("HEALTH_DOC_FILE");
  return metadata;
}
export function healthDocumentPublic(raw: unknown): HealthDocument | null {
  if (!noticeObject(raw) || !noticeUuid(raw.id) || typeof raw.file_name !== "string" || typeof raw.mime_type !== "string" || typeof raw.file_size !== "number" || typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 180 || !categories.includes(raw.category as string) || !(raw.document_date === null || typeof raw.document_date === "string" && !!healthDate(raw.document_date)) || !(raw.notes === null || typeof raw.notes === "string" && raw.notes.length <= 2000) || typeof raw.created_at !== "string" || !healthTimestamp(raw.created_at)) return null;
  try { healthDocumentMetadata({ name: raw.file_name, type: raw.mime_type, size: raw.file_size }); } catch { return null; }
  return Object.fromEntries(fields.map(k => [k, raw[k]])) as HealthDocument;
}
export function healthDocumentKey(key: unknown, scope: HealthDocumentScope) {
  if (typeof key !== "string") return false;
  const prefixes = [`families/${scope.familyId}/health/${encodeURIComponent(scope.actorId)}/`, `families/${scope.familyId}/health/${scope.actorId}/`];
  const prefix = prefixes.find(p => key.startsWith(p)); if (!prefix) return false;
  const parts = key.slice(prefix.length).split(".");
  return parts.length === 2 && noticeUuid(parts[0]) && [...Object.values(types).flat(), "bin"].includes(parts[1]);
}
export function healthDocumentDeleteInput(raw: unknown, id: string, actual?: HealthDocumentScope) {
  if (!noticeObject(raw) || !noticeUuid(id) || Object.keys(raw).some(k => !["expectedScope", "expectedDocument"].includes(k))) throw new HealthDocumentError("HEALTH_DOC_INPUT");
  const scope = healthDocumentScope(raw.expectedScope, actual), document = healthDocumentPublic(raw.expectedDocument);
  if (!document || document.id !== id || !noticeObject(raw.expectedDocument) || Object.keys(raw.expectedDocument).some(k => !fields.includes(k))) throw new HealthDocumentError("HEALTH_DOC_INPUT");
  return { scope, document };
}
function ownDocument(raw: unknown, scope: HealthDocumentScope, key: string) {
  return noticeObject(raw) && raw.family_id === scope.familyId && raw.auth_user_id === scope.actorId && raw.storage_key === key && healthDocumentKey(key, scope) ? healthDocumentPublic(raw) : null;
}
export async function uploadHealthDocument(o: {
  id: string; key: string; input: ReturnType<typeof healthDocumentInput>;
  put: () => Promise<unknown>; create: () => Promise<unknown>; discardUnlinked: () => Promise<unknown>;
  rejected: (e: unknown) => boolean; audit: () => Promise<unknown>;
}) {
  if (!noticeUuid(o.id) || !healthDocumentKey(o.key,o.input.scope) || !o.key.endsWith("/"+o.id+"."+o.input.metadata.extension)) throw new HealthDocumentError("HEALTH_DOC_INPUT");
  let record: HealthDocument;
  const discard = async (code: string, status: number): Promise<never> => { try { await o.discardUnlinked(); } catch { throw new HealthDocumentError("HEALTH_DOC_UNLINKED_PENDING", 503, o.id); } throw new HealthDocumentError(code, status, o.id); };
  try {
    const object = await o.put();
    if (!noticeObject(object) || object.key !== o.key || object.size !== o.input.metadata.size) throw new Error("Storage acknowledgement missing.");
  } catch { return discard("HEALTH_DOC_STORAGE_WRITE", 503); }
  try {
    const rows = await o.create();
    if (!Array.isArray(rows) || rows.length !== 1) throw new HealthDocumentError("HEALTH_DOC_UNKNOWN", 503, o.id);
    const document = ownDocument(rows[0], o.input.scope, o.key);
    if (!document || document.id !== o.id || document.file_name !== o.input.metadata.name || document.mime_type !== o.input.metadata.type || document.file_size !== o.input.metadata.size || document.title !== o.input.title || document.category !== o.input.category || document.document_date !== o.input.documentDate || document.notes !== o.input.notes) throw new HealthDocumentError("HEALTH_DOC_UNKNOWN", 503, o.id);
    record = document;
  } catch (e) {
    if (o.rejected(e)) return discard("HEALTH_DOC_REJECTED", 409);
    // The insert might have committed: deleting the object here could destroy a saved medical file.
    throw new HealthDocumentError("HEALTH_DOC_UNKNOWN", 503, o.id);
  }
  let auditPending = false;
  try { await o.audit(); } catch { auditPending = true; console.error("Health document upload confirmed; audit pending."); }
  return { success: true, id: o.id, scope: o.input.scope, document: record, auditPending, cleanupPending: false, ...(auditPending ? { code: "HEALTH_DOC_PENDING" } : {}) };
}
export function healthDocumentFilter(row: HealthDocument, key: string, scope: HealthDocumentScope) {
  const q = new URLSearchParams({ family_id: `eq.${scope.familyId}`, auth_user_id: `eq.${scope.actorId}` });
  for (const [k, v] of Object.entries({ ...row, storage_key: key })) q.set(k, v === null ? "is.null" : typeof v === "string" ? `eq."${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `eq.${v}`);
  return q;
}
export async function deleteHealthDocument(o: {
  id: string; scope: HealthDocumentScope; expected: HealthDocument; existing: unknown;
  removeRecord: (q: URLSearchParams) => Promise<unknown>; removeUnreferencedObject: (key: string) => Promise<unknown>;
  rejected: (e: unknown) => boolean; audit: (cleanupPending: boolean) => Promise<unknown>;
}) {
  const raw = o.existing;
  if (!noticeObject(raw) || !healthDocumentKey(raw.storage_key, o.scope)) throw new HealthDocumentError("HEALTH_DOC_CHANGED", 409);
  const key = raw.storage_key as string, row = ownDocument(raw, o.scope, key);
  if (!row || row.id !== o.id || !healthRecordsEqual(o.expected as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>)) throw new HealthDocumentError("HEALTH_DOC_CHANGED", 409);
  try {
    const rows = await o.removeRecord(healthDocumentFilter(row, key, o.scope));
    if (Array.isArray(rows) && rows.length === 0) throw new HealthDocumentError("HEALTH_DOC_CHANGED", 409);
    const removed = Array.isArray(rows) && rows.length === 1 ? ownDocument(rows[0], o.scope, key) : null;
    if (!removed || !healthRecordsEqual(row as unknown as Record<string, unknown>, removed as unknown as Record<string, unknown>)) throw new HealthDocumentError("HEALTH_DOC_UNKNOWN", 503, o.id);
  } catch (e) {
    if (e instanceof HealthDocumentError) throw e;
    throw new HealthDocumentError(o.rejected(e) ? "HEALTH_DOC_REJECTED" : "HEALTH_DOC_UNKNOWN", o.rejected(e) ? 409 : 503, o.id);
  }
  let cleanupPending = false, auditPending = false;
  try { await o.removeUnreferencedObject(key); } catch { cleanupPending = true; console.error("Health document record removed; storage reconciliation pending."); }
  try { await o.audit(cleanupPending); } catch { auditPending = true; console.error("Health document removal confirmed; audit pending."); }
  return { success: true, id: o.id, scope: o.scope, deleted: true, cleanupPending, auditPending, ...(cleanupPending || auditPending ? { code: "HEALTH_DOC_PENDING" } : {}) };
}
export function healthDocumentAcknowledged(path: string, method: string, body: unknown, status: number, raw: unknown) {
  if (!noticeObject(raw) || raw.success !== true || !noticeUuid(raw.id) || raw.outcomeUnknown === true || typeof raw.auditPending !== "boolean" || typeof raw.cleanupPending !== "boolean" || (status === 202) !== (raw.auditPending || raw.cleanupPending) || status === 202 && raw.code !== "HEALTH_DOC_PENDING") return false;
  try {
    if (path === "/api/health/upload" && method === "POST" && body instanceof FormData) {
      const input = healthDocumentInput(body), document = healthDocumentPublic(raw.document);
      return !!document && noticeObject(raw.document) && Object.keys(raw.document).every(k => fields.includes(k)) && document.id === raw.id && !raw.cleanupPending && !Object.hasOwn(raw, "deleted") && [201, 202].includes(status) && noticeObject(raw.scope) && raw.scope.familyId === input.scope.familyId && raw.scope.actorId === input.scope.actorId && document.file_name === input.metadata.name && document.mime_type === input.metadata.type && document.file_size === input.metadata.size && document.title === input.title && document.category === input.category && document.document_date === input.documentDate && document.notes === input.notes;
    }
    const match = /^\/api\/health-document\/([^/]+)$/.exec(path);
    if (!match || method !== "DELETE") return false;
    const input = healthDocumentDeleteInput(body, match[1]);
    return raw.id === match[1] && raw.deleted === true && !Object.hasOwn(raw, "document") && [200, 202].includes(status) && noticeObject(raw.scope) && raw.scope.familyId === input.scope.familyId && raw.scope.actorId === input.scope.actorId;
  } catch { return false; }
}
export function healthDocumentCopy(code: unknown, locale: "bn" | "en") {
  const copies: Record<string, [string, string]> = {
    HEALTH_DOC_UNKNOWN: ["Document upload/delete-এর ফল নিশ্চিত নয়। আবার পাঠাবেন না; Health reload করে document তালিকা review করুন। প্রয়োজনে Support-এ জানান।", "The document upload/delete outcome is uncertain. Do not repeat it; reload Health and review the document list. Contact support if needed."],
    HEALTH_DOC_PENDING: ["Document record-এর পরিবর্তন নিশ্চিত; storage cleanup বা audit বাকি। আবার upload/delete নয়—Support-এর সহায়তা নিন।", "The document record change is confirmed; storage cleanup or audit is pending. Do not upload/delete again; contact support."],
    HEALTH_DOC_UNLINKED_PENDING: ["Document save হয়নি; unlinked file cleanup নিশ্চিত নয়। আবার upload না করে Support-এ জানান।", "The document was not saved; unlinked-file cleanup is unconfirmed. Contact support instead of uploading again."],
    HEALTH_DOC_FILE: ["সঠিক filename, MIME, extension ও content header দিন। JPG/PNG/WebP/PDF/Word সর্বোচ্চ ১২ MiB।", "Use a matching filename, MIME, extension and content header. JPG/PNG/WebP/PDF/Word up to 12 MiB."],
    HEALTH_DOC_INPUT: ["Title সর্বোচ্চ ১৮০ ও notes ২০০০ অক্ষর; সঠিক category, date ও বর্তমান document দিন।", "Title: up to 180 characters; notes: 2,000. Use a valid category, date and current document."],
    HEALTH_DOC_CONTEXT: ["Family/account বদলেছে। বর্তমান Health workspace reload করুন।", "The family/account changed. Reload the current Health workspace."],
    HEALTH_DOC_CHANGED: ["Document বদলেছে বা সরেছে। বর্তমান Health তালিকা reload করুন।", "The document changed or was removed. Reload the current Health list."],
    HEALTH_DOC_REJECTED: ["Document পরিবর্তন database প্রত্যাখ্যান করেছে। বর্তমান তালিকা reload করুন।", "The database rejected the document change. Reload the current list."],
    HEALTH_DOC_STORAGE: ["Private storage configured নয়; কোনো document save/delete হয়নি।", "Private storage is not configured; no document was saved/deleted."],
    HEALTH_DOC_STORAGE_WRITE: ["Document save হয়নি; এই upload-এর unlinked object cleanup সম্পন্ন। Storage যাচাই করুন।", "The document was not saved; this upload's unlinked object cleanup completed. Check storage."],
  };
  return typeof code === "string" && Object.hasOwn(copies, code) ? copies[code][locale === "bn" ? 0 : 1] : null;
}
function relevant(path: string, method: string) { return path === "/api/health/upload" && method === "POST" || /^\/api\/health-document\/[^/]+$/.test(path) && method === "DELETE"; }
function uncertain(status: number, raw: unknown) {
  const p = noticeObject(raw) ? raw : {};
  if (p.code === "HEALTH_DOC_UNLINKED_PENDING" || p.outcomeUnknown === true) return true;
  return (status >= 500 || status === 408) && !["HEALTH_DOC_STORAGE", "HEALTH_DOC_STORAGE_WRITE"].includes(p.code as string);
}
export function healthDocumentFeedback(path: string, status: number, raw: unknown, locale: "bn" | "en", method: string, body?: unknown) {
  if (!relevant(path, method)) return null;
  const p = noticeObject(raw) ? raw : {};
  if (uncertain(status, raw) || status >= 200 && status < 300 && !healthDocumentAcknowledged(path, method, body, status, raw)) return { kind: "info" as const, title: locale === "bn" ? "Document ফল review করুন" : "Review document outcome", message: healthDocumentCopy(p.code === "HEALTH_DOC_UNLINKED_PENDING" ? p.code : "HEALTH_DOC_UNKNOWN", locale)! };
  if (status === 202) return { kind: "info" as const, title: locale === "bn" ? "Document পরিবর্তন নিশ্চিত; কাজ বাকি" : "Document change confirmed; work pending", message: healthDocumentCopy("HEALTH_DOC_PENDING", locale)! };
  const message = healthDocumentCopy(status === 413 ? "HEALTH_DOC_FILE" : p.code, locale);
  return status >= 400 && message ? { kind: "error" as const, title: "Error", message } : null;
}
export async function readHealthDocumentMutation(request: () => Promise<Response>, path: string, method: string, body: unknown) {
  try {
    const response = await request(); if (response.status === 499) return { kind: "cancelled" as const, payload: {} };
    const raw: unknown = await response.json().catch(() => null), payload = response.status===413?{code:"HEALTH_DOC_FILE"}:noticeObject(raw) ? raw : {};
    if (uncertain(response.status, raw) || response.ok && !healthDocumentAcknowledged(path, method, body, response.status, raw)) return { kind: "unknown" as const, payload };
    return { kind: response.ok ? "confirmed" as const : "rejected" as const, payload };
  } catch { return { kind: "unknown" as const, payload: {} }; }
}
export function healthDocumentActionCopy(path: string, method: string, locale: "bn" | "en") {
  if (!relevant(path, method)) return null;
  const remove = method === "DELETE", bn = locale === "bn";
  return { title: remove ? bn ? "Medical document স্থায়ীভাবে মুছবেন?" : "Delete medical document permanently?" : bn ? "Private medical document upload করবেন?" : "Upload private medical document?", description: remove ? bn ? "নিজের document record মুছে যাবে; নিশ্চিত delete-এর পর file cleanup হবে। এটি ফিরিয়ে আনার ব্যবস্থা নেই। Cancel/× কোনো delete পাঠায় না।" : "Your document record will be removed; file cleanup follows a confirmed deletion. There is no undo. Cancel/× sends no delete." : bn ? "এই file শুধু আপনার ব্যক্তিগত Health workspace-এ থাকবে। Cancel/× কোনো upload পাঠায় না।" : "This file stays in your private Health workspace. Cancel/× sends no upload.", confirmLabel: remove ? bn ? "হ্যাঁ, মুছুন" : "Yes, delete" : bn ? "হ্যাঁ, upload করুন" : "Yes, upload", destructive: remove, successMessage: remove ? bn ? "Medical document record মুছে গেছে।" : "Medical document record deleted." : bn ? "Private medical document সংরক্ষিত।" : "Private medical document saved." };
}
