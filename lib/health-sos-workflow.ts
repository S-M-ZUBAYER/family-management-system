import { healthDecimal, healthNumber } from "./health-validation.ts";

type Rest = <T>(path: string, init?: RequestInit) => Promise<T>;
export class HealthSosWorkflowError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; }
}
export function healthSosLocation(data: Record<string, unknown>) {
  const latitude = healthNumber(data.latitude), longitude = healthNumber(data.longitude), accuracy = healthDecimal(data.locationAccuracyM);
  const coordinate = (n: number | null | undefined, max: number) => n === null || (n !== undefined && Math.abs(n) <= max && Math.round(n * 10_000_000) / 10_000_000 === n);
  if (!coordinate(latitude, 90) || !coordinate(longitude, 180) || ((latitude === null) !== (longitude === null)) || accuracy === undefined || (accuracy !== null && (accuracy < 0 || latitude === null))) {
    throw new HealthSosWorkflowError("HEALTH_SOS_LOCATION", 400, "Enter valid paired coordinates and nonnegative accuracy.");
  }
  return { latitude: latitude ?? null, longitude: longitude ?? null, location_accuracy_m: accuracy };
}
export function publicHealthSosRecord(record: Record<string, unknown>, viewerId: string) {
  const fields = ["id", "reporter_name", "alert_type", "message", "preferred_contact", "latitude", "longitude", "location_accuracy_m", "location_label", "status", "acknowledged_by_name", "acknowledged_at", "resolved_at", "resolution_note", "created_at", "updated_at"];
  return { ...Object.fromEntries(fields.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]])), is_reporter: record.reporter_user_id === viewerId };
}
function active(status: unknown) { return status === "active" || status === "acknowledged"; }
async function lookup(rest: Rest, familyId: string, alertId: string) {
  const query = new URLSearchParams({ select: "id,reporter_user_id,status", id: `eq.${alertId}`, family_id: `eq.${familyId}`, limit: "1" });
  const record = (await rest<Array<Record<string, unknown>>>(`health_sos_alerts?${query}`))[0];
  if (!record) throw new HealthSosWorkflowError("HEALTH_SOS_NOT_FOUND", 404, "SOS alert was not found in this family.");
  if (!active(record.status)) throw new HealthSosWorkflowError("HEALTH_SOS_CLOSED", 409, "This SOS alert is already closed. Refresh before continuing.");
  return record;
}
async function audit(rest: Rest, familyId: string, userId: string, action: string, entity: string, id: string) {
  await rest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entity, entity_id: id, metadata: { module: "health", scope: "family_sos" } }) });
}
export async function closeHealthSos(rest: Rest, familyId: string, userId: string, canManage: boolean, alertId: string, status: "resolved" | "cancelled", note: string | null) {
  const alert = await lookup(rest, familyId, alertId);
  if (alert.reporter_user_id !== userId && !canManage) throw new HealthSosWorkflowError("HEALTH_SOS_FORBIDDEN", 403, "Only the reporter or a health manager can close this SOS.");
  const now = new Date().toISOString();
  const query = new URLSearchParams({ id: `eq.${alertId}`, family_id: `eq.${familyId}`, status: `eq.${alert.status}` });
  const [record] = await rest<Array<Record<string, unknown>>>(`health_sos_alerts?${query}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status, resolved_by_user_id: userId, resolved_at: now, resolution_note: note, updated_at: now }) });
  if (!record) throw new HealthSosWorkflowError("HEALTH_SOS_CONFLICT", 409, "The SOS changed while saving. Refresh and retry.");
  await audit(rest, familyId, userId, `health_sos_${status}`, "health_sos_alert", alertId);
  return publicHealthSosRecord(record, userId);
}
export async function respondHealthSos(rest: Rest, familyId: string, userId: string, authorName: string, alertId: string, responseType: string, note: string | null) {
  if (!["acknowledged", "on_the_way", "called_emergency", "update"].includes(responseType)) throw new HealthSosWorkflowError("HEALTH_SOS_RESPONSE", 400, "Choose a valid SOS response.");
  const alert = await lookup(rest, familyId, alertId);
  const [record] = await rest<Array<Record<string, unknown>>>("health_sos_responses", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: familyId, alert_id: alertId, responder_user_id: userId, responder_name: authorName, response_type: responseType, note }) });
  if (alert.status === "active") {
    const now = new Date().toISOString();
    // Conditional update cannot reopen a concurrently closed alert or replace an earlier acknowledgment.
    const query = new URLSearchParams({ id: `eq.${alertId}`, family_id: `eq.${familyId}`, status: "eq.active" });
    await rest(`health_sos_alerts?${query}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "acknowledged", acknowledged_by_user_id: userId, acknowledged_by_name: authorName, acknowledged_at: now, updated_at: now }) });
  }
  await audit(rest, familyId, userId, "health_sos_response_created", "health_sos_response", String(record.id));
  return { id: record.id, alert_id: record.alert_id, responder_name: record.responder_name, response_type: record.response_type, note: record.note, created_at: record.created_at, is_mine: true };
}
