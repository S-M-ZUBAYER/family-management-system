import { noticeObject, noticeUuid } from "./notice-validation.ts";
import { healthDate, healthNumber, healthTimestamp, healthReminderTimes } from "./health-validation.ts";
import type { HealthPayload } from "./health-types.ts";

const account = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 240 && !/[\u0000-\u001f\u007f]/.test(v);
const text = (v: unknown, nullable = true) => v === null && nullable || typeof v === "string" && (nullable || !!v.trim()) && v.length <= 5000;
const date = (v: unknown, nullable = true) => v === null && nullable || typeof v === "string" && !!healthDate(v);
const stamp = (v: unknown, nullable = false) => v === null && nullable || typeof v === "string" && !!healthTimestamp(v);
const number = (v: unknown, nullable = true) => v === null && nullable || healthNumber(v) !== null && healthNumber(v) !== undefined && v !== undefined;
const blood = (v: unknown) => v === null || ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].includes(v as string);
const clean = (row: Record<string, unknown>) => !["family_id", "auth_user_id", "storage_key", "reporter_user_id", "responder_user_id", "acknowledged_by_user_id", "resolved_by_user_id"].some(k => Object.hasOwn(row, k));
function profile(row: Record<string, unknown>, directory = false) {
  const notes = ["conditions", "allergies", "emergency_notes", "emergency_contact_name", "emergency_contact_phone"];
  if (!text(row.member_name, false) || !blood(row.blood_group) || typeof row.donor_available !== "boolean" || !date(row.last_donation_date) || !["private", "emergency", "family"].includes(row.visibility as string) || notes.some(k => !text(row[k]))) return false;
  if (directory) return (row.visibility !== "private" || row.donor_available === true && notes.every(k => row[k] === null)) && (row.visibility !== "emergency" || row.conditions === null);
  return noticeUuid(row.id) && date(row.date_of_birth) && number(row.height_cm) && number(row.weight_kg) && ["doctor_name", "doctor_phone"].every(k => text(row[k])) && stamp(row.updated_at);
}
export type HealthSnapshot = Required<Pick<HealthPayload, "family" | "viewer" | "profile" | "medications" | "appointments" | "measurements" | "documents" | "emergencyDirectory" | "sosAlerts" | "sosResponses" | "permissions" | "migrationRequired">> & {
  family: { id: string; name_bn: string; name_en: string }; viewer: { displayName: string; role: string }; scope: { familyId: string; actorId: string };
};
export function healthReadSnapshot(raw: unknown): HealthSnapshot | null {
  if (!noticeObject(raw) || !noticeObject(raw.family) || !noticeUuid(raw.family.id) || !text(raw.family.name_bn, false) || typeof raw.family.name_en !== "string"
    || !noticeObject(raw.scope) || raw.scope.familyId !== raw.family.id || !account(raw.scope.actorId) || !noticeObject(raw.viewer) || !text(raw.viewer.displayName, false) || !["owner", "family_admin", "manager", "member"].includes(raw.viewer.role as string)
    || typeof raw.migrationRequired !== "boolean" || !noticeObject(raw.permissions) || raw.permissions.canManageSos !== (raw.viewer.role !== "member")) return null;
  if (!(raw.profile === null || noticeObject(raw.profile) && clean(raw.profile) && profile(raw.profile))) return null;
  const sections = ["medications", "appointments", "measurements", "documents", "emergencyDirectory", "sosAlerts", "sosResponses"];
  const alertIds = new Set<string>();
  for (const section of sections) {
    const rows = raw[section]; if (!Array.isArray(rows) || rows.length > 20000 || raw.migrationRequired && rows.length) return null;
    const ids = new Set<string>();
    for (const r of rows) {
      if (!noticeObject(r) || !clean(r)) return null;
      if (section !== "emergencyDirectory") { if (!noticeUuid(r.id) || ids.has(r.id)) return null; ids.add(r.id); }
      if (section === "emergencyDirectory") { if (!profile(r, true)) return null; continue; }
      if (!stamp(r.created_at)) return null;
      if (["medications", "appointments", "sosAlerts"].includes(section) && !stamp(r.updated_at)) return null;
      if (section === "medications" && (!text(r.medicine_name, false) || !text(r.dosage, false) || !text(r.frequency, false) || !healthReminderTimes(r.reminder_times) || !Array.isArray(r.reminder_times) || new Set(r.reminder_times).size !== r.reminder_times.length || !date(r.start_date, false) || !date(r.end_date) || r.end_date !== null && (r.end_date as string) < (r.start_date as string) || !text(r.instructions) || !text(r.prescribing_doctor) || !["active", "paused", "completed"].includes(r.status as string))) return null;
      if (section === "appointments" && (!text(r.title, false) || !text(r.doctor_name) || !text(r.facility) || !stamp(r.scheduled_at) || !Number.isInteger(r.reminder_minutes) || (r.reminder_minutes as number) < 0 || (r.reminder_minutes as number) > 10080 || !["scheduled", "completed", "cancelled"].includes(r.status as string) || !text(r.notes))) return null;
      if (section === "measurements" && (!["blood_pressure", "blood_sugar", "pulse", "temperature", "weight", "oxygen"].includes(r.measurement_type as string) || !number(r.value_primary, false) || !number(r.value_secondary) || !text(r.unit, false) || !stamp(r.measured_at) || !text(r.notes))) return null;
      if (section === "documents" && (!text(r.file_name, false) || !text(r.mime_type, false) || !Number.isSafeInteger(r.file_size) || (r.file_size as number) < 1 || !["prescription", "lab_report", "imaging", "vaccine", "insurance", "other"].includes(r.category as string) || !text(r.title, false) || !date(r.document_date) || !text(r.notes))) return null;
      if (section === "sosAlerts") {
        if (!text(r.reporter_name, false) || !["medical", "accident", "fire", "safety", "other"].includes(r.alert_type as string) || !text(r.message, false) || !["active", "acknowledged", "resolved", "cancelled"].includes(r.status as string) || typeof r.is_reporter !== "boolean" || ["preferred_contact", "location_label", "acknowledged_by_name", "resolution_note"].some(k => !text(r[k])) || !stamp(r.acknowledged_at, true) || !stamp(r.resolved_at, true) || !number(r.latitude) || !number(r.longitude) || !number(r.location_accuracy_m) || (r.latitude === null) !== (r.longitude === null)) return null;
        if (r.latitude !== null && (Math.abs(Number(r.latitude)) > 90 || Math.abs(Number(r.longitude)) > 180) || r.location_accuracy_m !== null && Number(r.location_accuracy_m) < 0) return null;
        alertIds.add(r.id as string);
      }
      if (section === "sosResponses" && (!noticeUuid(r.alert_id) || !alertIds.has(r.alert_id) || !text(r.responder_name, false) || !["acknowledged", "on_the_way", "called_emergency", "update", "resolved"].includes(r.response_type as string) || !text(r.note) || typeof r.is_mine !== "boolean")) return null;
    }
  }
  if (raw.migrationRequired && raw.profile !== null) return null;
  return raw as HealthSnapshot;
}
export class HealthReadError extends Error { readonly code: string; constructor(code: string) { super(code); this.code = code; } }
export class HealthReadGate {
  private token: { controller: AbortController } | null = null;
  begin() { this.token?.controller.abort(); const t = { controller: new AbortController() }; this.token = t; return t; }
  current(t: { controller: AbortController }) { return this.token === t && !t.controller.signal.aborted; }
  invalidate() { this.token?.controller.abort(); this.token = null; }
}
export async function readHealth(request: (init: RequestInit) => Promise<Response>, signal?: AbortSignal, timeoutMs = 25000): Promise<HealthSnapshot> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let onAbort = () => {};
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new HealthReadError("HEALTH_READ_TIMEOUT")); controller.abort(); }, timeoutMs); });
  const aborted = new Promise<never>((_, reject) => { onAbort = () => { reject(new HealthReadError("HEALTH_READ_SUPERSEDED")); controller.abort(); }; signal?.addEventListener("abort", onAbort, { once: true }); if (signal?.aborted) onAbort(); });
  try {
    const r = await Promise.race([request({ cache: "no-store", signal: controller.signal }), deadline, aborted]);
    if ([401, 403, 413].includes(r.status)) throw new HealthReadError(r.status === 401 ? "HEALTH_READ_SIGN_IN" : r.status === 413 ? "HEALTH_ROW_LIMIT" : "HEALTH_READ_ACCESS");
    const raw: unknown = await Promise.race([r.json(), deadline, aborted]);
    if (r.status === 409) throw new HealthReadError(noticeObject(raw) && raw.code === "FAMILY_SETUP_REQUIRED" ? "HEALTH_READ_SETUP" : "HEALTH_READ_CONTEXT");
    if (!r.ok) throw new HealthReadError("HEALTH_READ_FAILED");
    const s = healthReadSnapshot(raw); if (!s) throw new HealthReadError("HEALTH_READ_INVALID"); return s;
  } catch (e) { throw e instanceof HealthReadError ? e : new HealthReadError("HEALTH_READ_FAILED"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}
export function healthReadCopy(code: unknown, locale: "bn" | "en") {
  const messages: Record<string, [string, string]> = {
    HEALTH_READ_TIMEOUT: ["Health লোডের সময় শেষ। পুরোনো ব্যক্তিগত তথ্য সরানো হয়েছে; Retry করুন।", "Health loading timed out. Previous private data was cleared; retry."],
    HEALTH_READ_INVALID: ["সম্পূর্ণ সঠিক Health snapshot পাওয়া যায়নি। পরিবর্তন ও export বন্ধ; Retry করুন।", "A complete valid Health snapshot was not received. Changes and export are disabled; retry."],
    HEALTH_READ_SIGN_IN: ["ব্যক্তিগত Health তথ্য দেখতে sign in করুন।", "Sign in to view private Health data."],
    HEALTH_READ_ACCESS: ["Health access সক্রিয় নয়। পরিবারের সদস্যপদ যাচাই করুন।", "Health access is not active. Check your family membership."],
    HEALTH_READ_SETUP: ["আগে family setup বা approval সম্পন্ন করুন।", "Complete family setup or approval first."],
    HEALTH_READ_CONTEXT: ["পরিবার বা account বদলেছে। আগের তথ্য দিয়ে কোনো export হয়নি; বর্তমান workspace লোড করুন।", "The family or account changed. No export used the previous data; load the current workspace."],
    HEALTH_READ_SUPERSEDED: ["নতুন read শুরু হয়েছে বা page বন্ধ হয়েছে; আগের ফল ব্যবহার হয়নি।", "A newer read started or the page closed; the obsolete result was not used."],
    HEALTH_ROW_LIMIT: ["একটি Health section ২০,০০০ সারি ছাড়িয়েছে। অসম্পূর্ণ তথ্য/export হবে না; Support-এর সহায়তা নিন।", "A Health section exceeds 20,000 rows. No partial data/export will be used; contact support."],
    HEALTH_READ_FAILED: ["Health তথ্য লোড হয়নি। পুরোনো ব্যক্তিগত তথ্য সরানো হয়েছে; Retry করুন।", "Health data could not be loaded. Previous private data was cleared; retry."],
  };
  return (messages[typeof code === "string" ? code : ""] ?? messages.HEALTH_READ_FAILED)[locale === "bn" ? 0 : 1];
}
