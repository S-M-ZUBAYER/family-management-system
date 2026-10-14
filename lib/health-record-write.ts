import { noticeObject } from "./notice-validation.ts";
import { healthUuid, healthTimestamp, healthDecimal, healthDate, healthReminderMinutes, healthReminderTimes } from "./health-validation.ts";
import { healthReadSnapshot } from "./health-read.ts";

export type HealthRecordKind = "profile" | "medication" | "appointment" | "measurement";
export const healthRecordTables = { profile: "health_profiles", medication: "health_medications", appointment: "health_appointments", measurement: "health_measurements" } as const;
const columns: Record<HealthRecordKind, string[]> = {
  profile: ["id", "member_name", "blood_group", "date_of_birth", "height_cm", "weight_kg", "conditions", "allergies", "emergency_notes", "doctor_name", "doctor_phone", "emergency_contact_name", "emergency_contact_phone", "donor_available", "last_donation_date", "visibility", "updated_at"],
  medication: ["id", "medicine_name", "dosage", "frequency", "reminder_times", "start_date", "end_date", "instructions", "prescribing_doctor", "status", "created_at", "updated_at"],
  appointment: ["id", "title", "doctor_name", "facility", "scheduled_at", "reminder_minutes", "status", "notes", "created_at", "updated_at"],
  measurement: ["id", "measurement_type", "value_primary", "value_secondary", "unit", "measured_at", "notes", "created_at"],
};
export class HealthRecordWriteError extends Error {
  readonly code:string; readonly status:number;
  constructor(code: string, status = 409) { super(code); this.code=code;this.status=status; }
}
export function healthPublicRecord(kind: HealthRecordKind, value: unknown): Record<string, unknown> | null {
  if (!noticeObject(value) || !Object.hasOwn(columns, kind)) return null;
  const row = Object.fromEntries(columns[kind].map(k => [k, value[k]]));
  const snapshot:Record<string,unknown> = { family: { id: "20000000-0000-4000-8000-000000000002", name_bn: "Validation", name_en: "Validation" }, scope: { familyId: "20000000-0000-4000-8000-000000000002", actorId: "validation" }, viewer: { displayName: "Validation", role: "member" }, permissions: { canManageSos: false }, migrationRequired: false, profile: null, medications: [], appointments: [], measurements: [], documents: [], emergencyDirectory: [], sosAlerts: [], sosResponses: [] };
  snapshot[kind === "profile" ? "profile" : kind === "medication" ? "medications" : kind === "appointment" ? "appointments" : "measurements"] = kind==="profile"?row:[row];
  return healthReadSnapshot(snapshot) ? row : null;
}
export function healthOrdinaryKind(method: string, body: Record<string, unknown>): HealthRecordKind | null {
  if (["PATCH", "DELETE"].includes(method)) return ["medication", "appointment", "measurement"].includes(body.kind as string) ? body.kind as HealthRecordKind : null;
  if (method !== "POST") return null;
  if (body.action === "save_profile") return "profile";
  if (body.action === "update_status" && noticeObject(body.data) && ["medication", "appointment"].includes(body.data.entity as string)) return body.data.entity as HealthRecordKind;
  const actions:Record<string,HealthRecordKind>={ create_medication: "medication", create_appointment: "appointment", create_measurement: "measurement" };
  return typeof body.action==="string"&&Object.hasOwn(actions,body.action)?actions[body.action]:null;
}
export function healthWriteContext(body: Record<string, unknown>, familyId: string, actorId: string, kind: HealthRecordKind) {
  if (!noticeObject(body.expectedScope) || body.expectedScope.familyId !== familyId || body.expectedScope.actorId !== actorId) throw new HealthRecordWriteError("HEALTH_WRITE_CONTEXT");
  if (!Object.hasOwn(body, "expectedRecord")) throw new HealthRecordWriteError("HEALTH_WRITE_EXPECTATION", 400);
  if (body.expectedRecord === null) return null;
  const row = healthPublicRecord(kind, body.expectedRecord);
  if (!row || !noticeObject(body.expectedRecord) || Object.keys(body.expectedRecord).some(k => !columns[kind].includes(k))) throw new HealthRecordWriteError("HEALTH_WRITE_EXPECTATION", 400);
  return row;
}
const numeric = new Set(["height_cm", "weight_kg", "value_primary", "value_secondary"]);
function same(key: string, a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  if (numeric.has(key)) return Number(a) === Number(b);
  if(key.endsWith("_at") && typeof a==="string" && typeof b==="string") {
    const precise=(v:string)=>`${healthTimestamp(v)}:${(v.match(/\.(\d+)(?:Z|[+-])/i)?.[1]??"").padEnd(6,"0").slice(3)}`;
    return precise(a)===precise(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
export function healthRecordsEqual(a: Record<string, unknown>, b: Record<string, unknown>) { return Object.keys(a).every(k => same(k, a[k], b[k])) && Object.keys(b).every(k => Object.hasOwn(a, k)); }

// Measurements have no update timestamp: compare every observed public field in
// the database filter. This prevents stale overwrites but is not an ABA ledger.
export function healthRecordFilter(kind: HealthRecordKind, row: Record<string, unknown>, familyId: string, actorId: string) {
  const q = new URLSearchParams({ id: `eq.${row.id}`, family_id: `eq.${familyId}`, auth_user_id: `eq.${actorId}` });
  const keys = kind === "measurement" ? columns.measurement.filter(k => k !== "id") : ["updated_at"];
  for (const key of keys) { const v = row[key]; q.set(key, v === null ? "is.null" : typeof v === "string" ? `eq."${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `eq.${v}`); }
  return q;
}
export async function healthRecordWrite(options: {
  kind: HealthRecordKind; familyId: string; actorId: string; expected: Record<string, unknown> | null;
  existing: unknown; changes: Record<string, unknown>; deletion?: boolean; now?: number;
  write: (changes: Record<string, unknown>, filter: URLSearchParams | null) => Promise<unknown>;
  audit: (id: string) => Promise<unknown>; rejected: (e: unknown) => boolean;
}) {
  const { kind, familyId, actorId, expected, changes } = options;
  const old = options.existing === null ? null : healthPublicRecord(kind, options.existing);
  if (options.existing !== null && (!old || !noticeObject(options.existing) || options.existing.family_id !== familyId || options.existing.auth_user_id !== actorId)) throw new HealthRecordWriteError("HEALTH_WRITE_CONTEXT");
  if ((expected === null) !== (old === null) || expected && old && !healthRecordsEqual(expected, old)) throw new HealthRecordWriteError("HEALTH_RECORD_CHANGED");
  if (options.deletion && !old) throw new HealthRecordWriteError("HEALTH_RECORD_CHANGED");
  const scope = { familyId, actorId };
  if (old && !options.deletion && Object.entries(changes).every(([k, v]) => same(k, v, old[k]))) return { success: true, id: old.id as string, kind, scope, record: old, noChange: true, auditPending: false };
  const next = { ...changes };
  if (!options.deletion && kind !== "measurement") next.updated_at = new Date(Math.max(options.now ?? Date.now(), old ? Date.parse(String(old.updated_at)) + 1 : 0)).toISOString();
  let record: Record<string, unknown> | null = null, id: string;
  try {
    const rows = await options.write(next, old ? healthRecordFilter(kind, old, familyId, actorId) : null);
    if (Array.isArray(rows) && rows.length === 0 && old) throw new HealthRecordWriteError("HEALTH_RECORD_CHANGED");
    if (!Array.isArray(rows) || rows.length !== 1 || !noticeObject(rows[0]) || !healthUuid(rows[0].id) || rows[0].family_id !== familyId || rows[0].auth_user_id !== actorId || old && rows[0].id !== old.id) throw new HealthRecordWriteError("HEALTH_WRITE_UNKNOWN", 503);
    id = rows[0].id as string;
    if(options.deletion && old && !healthRecordsEqual(old,healthPublicRecord(kind,rows[0])??{}))throw new HealthRecordWriteError("HEALTH_WRITE_UNKNOWN",503);
    if (!options.deletion) {
      record = healthPublicRecord(kind, rows[0]);
      if (!record || Object.entries(next).some(([k, v]) => !same(k, v, record![k])) || old && kind !== "profile" && record.created_at !== old.created_at) throw new HealthRecordWriteError("HEALTH_WRITE_UNKNOWN", 503);
    }
  } catch (e) {
    if (e instanceof HealthRecordWriteError) throw e;
    throw new HealthRecordWriteError(options.rejected(e) ? "HEALTH_WRITE_REJECTED" : "HEALTH_WRITE_UNKNOWN", options.rejected(e) ? 409 : 503);
  }
  let auditPending = false;
  try { await options.audit(id); } catch { auditPending = true; console.error("Health record write confirmed; audit pending."); }
  return { success: true, id, kind, scope, ...(record ? { record } : {}), noChange: false, auditPending, ...(auditPending ? { code: "HEALTH_AUDIT_PENDING" } : {}) };
}
export function healthRecordWriteResponse(result: Awaited<ReturnType<typeof healthRecordWrite>>, status = 200) {
  return Response.json(result, { status: result.auditPending ? 202 : status, headers: { "Cache-Control": "no-store" } });
}
function matchesHealthInput(kind:HealthRecordKind,row:Record<string,unknown>,body:Record<string,unknown>){
  if(!noticeObject(body.data))return false;
  const data=body.data;
  const maps:Record<HealthRecordKind,Record<string,string>>={
    profile:{bloodGroup:"blood_group",dateOfBirth:"date_of_birth",heightCm:"height_cm",weightKg:"weight_kg",conditions:"conditions",allergies:"allergies",emergencyNotes:"emergency_notes",doctorName:"doctor_name",doctorPhone:"doctor_phone",emergencyContactName:"emergency_contact_name",emergencyContactPhone:"emergency_contact_phone",donorAvailable:"donor_available",lastDonationDate:"last_donation_date",visibility:"visibility"},
    medication:{medicineName:"medicine_name",dosage:"dosage",frequency:"frequency",reminderTimes:"reminder_times",startDate:"start_date",endDate:"end_date",instructions:"instructions",prescribingDoctor:"prescribing_doctor"},
    appointment:{title:"title",doctorName:"doctor_name",facility:"facility",scheduledAt:"scheduled_at",reminderMinutes:"reminder_minutes",notes:"notes"},
    measurement:{measurementType:"measurement_type",valuePrimary:"value_primary",valueSecondary:"value_secondary",unit:"unit",measuredAt:"measured_at",notes:"notes"},
  };
  for(const [input,key]of Object.entries(maps[kind])){
    if(!Object.hasOwn(data,input))continue;
    let v:unknown=data[input];
    if(numeric.has(key))v=healthDecimal(v);
    else if(key==="reminder_times")v=healthReminderTimes(v);
    else if(key==="reminder_minutes")v=healthReminderMinutes(v);
    else if(key.endsWith("_date")||key==="date_of_birth")v=healthDate(v);
    else if(key.endsWith("_at"))v=healthTimestamp(v);
    else if(typeof v==="string")v=v.trim()||null;
    if(key==="value_secondary"&&data.measurementType!=="blood_pressure")v=null;
    if((key==="start_date"||key==="measured_at")&&v===null)continue; // Server default, not a browser-time comparison.
    if(!same(key,v,row[key]))return false;
  }
  return true;
}
export function healthRecordAcknowledged(method: string, body: Record<string, unknown>, status: number, raw: unknown) {
  const kind = healthOrdinaryKind(method, body);
  if (!kind || !noticeObject(raw) || raw.success !== true || raw.kind !== kind || !healthUuid(raw.id) || !noticeObject(raw.scope) || !noticeObject(body.expectedScope) || raw.scope.familyId !== body.expectedScope.familyId || raw.scope.actorId !== body.expectedScope.actorId || raw.outcomeUnknown === true || typeof raw.noChange !== "boolean" || typeof raw.auditPending !== "boolean" || (status === 202) !== raw.auditPending || raw.auditPending && raw.code !== "HEALTH_AUDIT_PENDING" || raw.noChange && raw.auditPending) return false;
  const expectedId = method === "PATCH" || method === "DELETE" ? body.recordId : body.action === "update_status" && noticeObject(body.data) ? body.data.id : noticeObject(body.expectedRecord) ? body.expectedRecord.id : null;
  if (expectedId && raw.id !== expectedId) return false;
  if (method === "DELETE") return !!expectedId && [200, 202].includes(status) && raw.noChange === false && !Object.hasOwn(raw, "record");
  const row = healthPublicRecord(kind, raw.record);
  if (!row || !noticeObject(raw.record) || Object.keys(raw.record).some(k => !columns[kind].includes(k)) || row.id !== raw.id || ![200, 201, 202].includes(status)) return false;
  if (body.action === "update_status") return noticeObject(body.data) && row.status === body.data.status;
  if(!matchesHealthInput(kind,row,body))return false;
  if(typeof body.action==="string"&&body.action.startsWith("create_"))return raw.noChange===false&&[201,202].includes(status)&&(kind==="medication"?row.status==="active":kind==="appointment"?row.status==="scheduled":true);
  return [200,202].includes(status);
}
export function healthRecordWriteCopy(code: unknown, locale: "bn" | "en") {
  const copy: Record<string, [string, string]> = {
    HEALTH_WRITE_UNKNOWN: ["পরিবর্তন হয়েছে কি না নিশ্চিত নয়। আবার Save/Upload/Delete করবেন না। Health reload করে বর্তমান রেকর্ড যাচাই করুন; প্রয়োজনে Support-এ জানান।", "The outcome is uncertain. Do not save/upload/delete again. Reload Health and review the current record; contact support if needed."],
    HEALTH_AUDIT_PENDING: ["রেকর্ডের পরিবর্তন নিশ্চিত; audit logging বাকি। আবার একই পরিবর্তন পাঠাবেন না; Support-এ জানান।", "The record change is confirmed; audit logging is pending. Do not repeat the change; contact support."],
    HEALTH_RECORD_CHANGED: ["রেকর্ড ইতিমধ্যে বদলেছে বা সরেছে। Health reload করে নতুন তথ্য দেখে আবার সম্পাদনা করুন।", "The record changed or was removed. Reload Health and review the latest data before editing."],
    HEALTH_WRITE_CONTEXT: ["পরিবার বা account বদলেছে। বর্তমান Health workspace reload করুন।", "The family or account changed. Reload the current Health workspace."],
    HEALTH_WRITE_EXPECTATION: ["সম্পূর্ণ বর্তমান রেকর্ড পাওয়া যায়নি। Health reload করে আবার খুলুন।", "The complete current record is missing. Reload Health and reopen the editor."],
    HEALTH_WRITE_REJECTED: ["Database পরিবর্তন প্রত্যাখ্যান করেছে। Health reload করে বর্তমান তথ্য যাচাই করুন।", "The database rejected the change. Reload Health and review the current data."],
  };
  return typeof code === "string" && Object.hasOwn(copy, code) ? copy[code][locale === "bn" ? 0 : 1] : null;
}
export function healthRecordFeedback(path: string, status: number, raw: unknown, locale: "bn" | "en", method: string, body: Record<string, unknown>) {
  if (path !== "/api/health/records" || !healthOrdinaryKind(method, body)) return null;
  const p = noticeObject(raw) ? raw : {};
  if (status >= 500 || status === 408 || p.outcomeUnknown === true || status >= 200 && status < 300 && !healthRecordAcknowledged(method, body, status, raw)) return { kind: "info" as const, title: locale === "bn" ? "Health ফল যাচাই প্রয়োজন" : "Health outcome needs review", message: healthRecordWriteCopy("HEALTH_WRITE_UNKNOWN", locale)! };
  if (status === 202) return { kind: "info" as const, title: locale === "bn" ? "Health সংরক্ষিত; audit বাকি" : "Health saved; audit pending", message: healthRecordWriteCopy("HEALTH_AUDIT_PENDING", locale)! };
  if (p.noChange === true && status === 200) return { kind: "info" as const, title: locale === "bn" ? "পরিবর্তন প্রয়োজন নেই" : "No change needed", message: locale === "bn" ? "রেকর্ড একই আছে; নতুন write বা audit হয়নি।" : "The record is unchanged; no new write or audit occurred." };
  const message = healthRecordWriteCopy(p.code, locale);
  return message && status >= 400 ? { kind: "error" as const, title: "Error", message } : null;
}
export async function readHealthRecordMutation(request: () => Promise<Response>, method: string, body: Record<string, unknown>) {
  try {
    const r = await request();
    if (r.status === 499) return { kind: "cancelled" as const, payload: {} };
    const raw: unknown = await r.json().catch(() => null), p = noticeObject(raw) ? raw : {};
    if (r.status >= 500 || r.status === 408 || p.outcomeUnknown === true || r.ok && !healthRecordAcknowledged(method, body, r.status, raw)) return { kind: "unknown" as const, payload: p };
    return { kind: r.ok ? "confirmed" as const : "rejected" as const, payload: p };
  } catch { return { kind: "unknown" as const, payload: {} }; }
}
