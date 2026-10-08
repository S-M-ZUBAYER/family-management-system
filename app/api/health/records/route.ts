import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHealth, getActiveFamilyMembership } from "@/lib/family-access";
import { getChatAuthorName } from "@/lib/family-chat";
import type {
  HealthAppointment,
  HealthMeasurement,
  HealthMedication,
  HealthProfile,
  HealthSosAlert,
} from "@/lib/health-types";
import { healthErrorResponse } from "../route";
import { supabaseRest } from "@/lib/supabase-rest";
import { healthDate, healthDecimal, healthReminderMinutes, healthReminderTimes, healthTimestamp, healthUuid } from "@/lib/health-validation";

import { closeHealthSos, respondHealthSos, healthSosLocation, publicHealthSosRecord, HealthSosWorkflowError } from "@/lib/health-sos-workflow";

type EditableHealthKind = "medication" | "appointment" | "measurement";
const editableTables: Record<EditableHealthKind, string> = {
  medication: "health_medications",
  appointment: "health_appointments",
  measurement: "health_measurements",
};

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const uuidValue = healthUuid;
const timestampValue = healthTimestamp;

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const action = textValue(body.action, 40);
    const data = body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data as Record<string, unknown>
      : body;
    const authorName = await getChatAuthorName(membership.family_id, user);
    const owner = { family_id: membership.family_id, auth_user_id: user.userId };

    if (action === "save_profile") {
      const visibility = textValue(data.visibility, 20) ?? "private";
      const bloodGroup = textValue(data.bloodGroup, 8);
      const height = healthDecimal(data.heightCm);
      const weight = healthDecimal(data.weightKg);
      const dateOfBirth = healthDate(data.dateOfBirth), lastDonationDate = healthDate(data.lastDonationDate);
      if (dateOfBirth === undefined || lastDonationDate === undefined) return Response.json({ code: "HEALTH_INVALID_DATE", error: "সঠিক তারিখ দিন।" }, { status: 400 });
      if (!["private", "emergency", "family"].includes(visibility)) {
        return Response.json({ error: "Privacy setting সঠিক নয়।" }, { status: 400 });
      }
      if (bloodGroup && !["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].includes(bloodGroup)) {
        return Response.json({ error: "Blood group সঠিক নয়।" }, { status: 400 });
      }
      if (height === undefined || weight === undefined || (height !== null && (height < 30 || height > 300)) || (weight !== null && (weight < 1 || weight > 700))) {
        return Response.json({ error: "Height বা weight value সঠিক নয়।" }, { status: 400 });
      }
      const now = new Date().toISOString();
      const [profile] = await supabaseRest<HealthProfile[]>("health_profiles?on_conflict=family_id,auth_user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          ...owner,
          member_name: authorName,
          blood_group: bloodGroup,
          date_of_birth: dateOfBirth,
          height_cm: height,
          weight_kg: weight,
          conditions: textValue(data.conditions, 4000),
          allergies: textValue(data.allergies, 4000),
          emergency_notes: textValue(data.emergencyNotes, 4000),
          doctor_name: textValue(data.doctorName, 180),
          doctor_phone: textValue(data.doctorPhone, 50),
          emergency_contact_name: textValue(data.emergencyContactName, 180),
          emergency_contact_phone: textValue(data.emergencyContactPhone, 50),
          donor_available: data.donorAvailable === true,
          last_donation_date: lastDonationDate,
          visibility,
          updated_at: now,
        }),
      });
      await audit(membership.family_id, user.userId, "health_profile_saved", "health_profiles", profile.id);
      return Response.json({ record: profile });
    }

    if (action === "create_medication") {
      const changes = healthRecordChanges("medication", data);
      if (changes instanceof Response) return changes;
      const [record] = await supabaseRest<HealthMedication[]>("health_medications", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...owner,
          ...changes,
          status: "active",
        }),
      });
      await audit(membership.family_id, user.userId, "health_medication_created", "health_medications", record.id);
      return Response.json({ record }, { status: 201 });
    }

    if (action === "create_appointment") {
      const changes = healthRecordChanges("appointment", data);
      if (changes instanceof Response) return changes;
      const [record] = await supabaseRest<HealthAppointment[]>("health_appointments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...owner,
          ...changes,
          status: "scheduled",
        }),
      });
      await audit(membership.family_id, user.userId, "health_appointment_created", "health_appointments", record.id);
      return Response.json({ record }, { status: 201 });
    }

    if (action === "create_measurement") {
      const changes = healthRecordChanges("measurement", data);
      if (changes instanceof Response) return changes;
      const [record] = await supabaseRest<HealthMeasurement[]>("health_measurements", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...owner,
          ...changes,
        }),
      });
      await audit(membership.family_id, user.userId, "health_measurement_created", "health_measurements", record.id);
      return Response.json({ record }, { status: 201 });
    }

    if (action === "update_status") {
      const entity = textValue(data.entity, 30);
      const id = uuidValue(data.id);
      const status = textValue(data.status, 20);
      const rules = entity === "medication"
        ? { table: "health_medications", values: ["active", "paused", "completed"] }
        : entity === "appointment"
          ? { table: "health_appointments", values: ["scheduled", "completed", "cancelled"] }
          : null;
      if (!rules || !id || !status || !rules.values.includes(status)) {
        return Response.json({ error: "Update request সঠিক নয়।" }, { status: 400 });
      }
      const [record] = await supabaseRest<Array<Record<string, unknown>>>(
        `${rules.table}?id=eq.${id}&family_id=eq.${membership.family_id}&auth_user_id=eq.${user.userId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
        },
      );
      if (!record) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
      await audit(membership.family_id, user.userId, `health_${entity}_status_updated`, rules.table, String(record.id));
      return Response.json({ record });
    }

    if (action === "create_sos") {
      const alertType = textValue(data.alertType, 20) ?? "medical";
      const message = textValue(data.message, 1000);
      if (!["medical", "accident", "fire", "safety", "other"].includes(alertType) || !message || message.length < 3) {
        return Response.json({ code: "HEALTH_SOS_INVALID", error: "SOS type and a message of at least three characters are required." }, { status: 400 });
      }
      const location = healthSosLocation(data);
      const [record] = await supabaseRest<HealthSosAlert[]>("health_sos_alerts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          family_id: membership.family_id,
          reporter_user_id: user.userId,
          reporter_name: authorName,
          alert_type: alertType,
          message,
          preferred_contact: textValue(data.preferredContact, 50),
          ...location,
          location_label: textValue(data.locationLabel, 300),
          status: "active",
        }),
      });
      await supabaseRest("audit_logs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          family_id: membership.family_id,
          actor_user_id: user.userId,
          action: "health_sos_created",
          entity_type: "health_sos_alert",
          entity_id: record.id,
          metadata: { alert_type: alertType, has_location: location.latitude !== null },
        }),
      });
      return Response.json({ record: publicHealthSosRecord(record, user.userId) }, { status: 201 });
    }

    if (action === "respond_sos") {
      const alertId = uuidValue(data.alertId), responseType = textValue(data.responseType, 30);
      if (!alertId || !responseType) return Response.json({ code: "HEALTH_SOS_RESPONSE", error: "Valid alert and response are required." }, { status: 400 });
      const record = await respondHealthSos(supabaseRest, membership.family_id, user.userId, authorName, alertId, responseType, textValue(data.note, 1000));
      return Response.json({ record }, { status: 201 });
    }

    if (action === "update_sos") {
      const alertId = uuidValue(data.alertId), status = textValue(data.status, 20);
      if (!alertId || (status !== "resolved" && status !== "cancelled")) return Response.json({ code: "HEALTH_SOS_INVALID", error: "Valid SOS alert and closing status are required." }, { status: 400 });
      const record = await closeHealthSos(supabaseRest, membership.family_id, user.userId, canManageHealth(membership.role), alertId, status, textValue(data.note, 1000));
      return Response.json({ record });
    }

    return Response.json({ error: "Unsupported health action." }, { status: 400 });
  } catch (error) {
    if (error instanceof HealthSosWorkflowError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
    return healthErrorResponse(error, "Unable to update health workspace");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const body = await request.json() as { kind?: EditableHealthKind; recordId?: unknown; data?: Record<string, unknown> };
    const kind = body.kind, recordId = uuidValue(body.recordId);
    if (!kind || !Object.hasOwn(editableTables, kind) || !recordId) return Response.json({ error: "Valid health record প্রয়োজন।" }, { status: 400 });
    const table = editableTables[kind];
    const lookup = new URLSearchParams({ select: "id", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}`, limit: "1" });
    if (!(await supabaseRest<Array<{ id: string }>>(`${table}?${lookup}`))[0]) return Response.json({ error: "নিজের health record পাওয়া যায়নি।" }, { status: 404 });
    const changes = healthRecordChanges(kind, body.data ?? {});
    if (changes instanceof Response) return changes;
    if (kind !== "measurement") changes.updated_at = new Date().toISOString();
    const filter = new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}` });
    const [record] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
    await audit(membership.family_id, user.userId, `health_${kind}_updated`, table, recordId);
    return Response.json({ record });
  } catch (error) {
    return healthErrorResponse(error, "Unable to update health record");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const body = await request.json() as { kind?: EditableHealthKind; recordId?: unknown };
    const kind = body.kind, recordId = uuidValue(body.recordId);
    if (!kind || !Object.hasOwn(editableTables, kind) || !recordId) return Response.json({ error: "Valid health record প্রয়োজন।" }, { status: 400 });
    const table = editableTables[kind];
    const filter = new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}` });
    const existing = (await supabaseRest<Array<{ id: string }>>(`${table}?${new URLSearchParams({ select: "id", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}`, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "নিজের health record পাওয়া যায়নি।" }, { status: 404 });
    await supabaseRest(`${table}?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await audit(membership.family_id, user.userId, `health_${kind}_deleted`, table, recordId);
    return Response.json({ message: `${kind} record স্থায়ীভাবে delete হয়েছে।` });
  } catch (error) {
    return healthErrorResponse(error, "Unable to delete health record");
  }
}

function healthRecordChanges(kind: EditableHealthKind, data: Record<string, unknown>): Record<string, unknown> | Response {
  if (kind === "medication") {
    const medicineName = textValue(data.medicineName, 180), dosage = textValue(data.dosage, 120), frequency = textValue(data.frequency, 120);
    const reminderTimes = healthReminderTimes(data.reminderTimes);
    const startDate = healthDate(data.startDate), endDate = healthDate(data.endDate);
    if (!medicineName || !dosage || !frequency || !reminderTimes) return Response.json({ code: "HEALTH_INVALID_MEDICATION", error: "ওষুধের নাম, মাত্রা, ব্যবধান ও রিমাইন্ডার সময় সঠিকভাবে দিন।" }, { status: 400 });
    const start = startDate ?? new Date().toISOString().slice(0, 10);
    if (startDate === undefined || endDate === undefined || (endDate && endDate < start)) return Response.json({ code: "HEALTH_INVALID_DATE", error: "সঠিক তারিখ দিন; শেষের তারিখ শুরুর আগে হতে পারবে না।" }, { status: 400 });
    return { medicine_name: medicineName, dosage, frequency, reminder_times: reminderTimes, start_date: start, end_date: endDate, instructions: textValue(data.instructions, 2000), prescribing_doctor: textValue(data.prescribingDoctor, 180) };
  }
  if (kind === "appointment") {
    const title = textValue(data.title, 180), scheduledAt = timestampValue(data.scheduledAt), reminderMinutes = healthReminderMinutes(data.reminderMinutes);
    if (!title || !scheduledAt || reminderMinutes === undefined) return Response.json({ code: "HEALTH_INVALID_APPOINTMENT", error: "অ্যাপয়েন্টমেন্টের শিরোনাম, সময় ও পূর্ণ মিনিটের রিমাইন্ডার সঠিকভাবে দিন।" }, { status: 400 });
    return { title, doctor_name: textValue(data.doctorName, 180), facility: textValue(data.facility, 220), scheduled_at: scheduledAt, reminder_minutes: reminderMinutes, notes: textValue(data.notes, 2000) };
  }
  const measurementType = textValue(data.measurementType, 30), primary = healthDecimal(data.valuePrimary), secondary = healthDecimal(data.valueSecondary), unit = textValue(data.unit, 30), measuredAt = timestampValue(data.measuredAt);
  if (!measurementType || !["blood_pressure", "blood_sugar", "pulse", "temperature", "weight", "oxygen"].includes(measurementType) || primary === null || primary === undefined || secondary === undefined || (measurementType === "blood_pressure" && secondary === null) || !unit || measuredAt === undefined) return Response.json({ code: "HEALTH_INVALID_MEASUREMENT", error: "পরিমাপের ধরন, সর্বোচ্চ দুই দশমিকের মান, একক ও সময় সঠিকভাবে দিন।" }, { status: 400 });
  return { measurement_type: measurementType, value_primary: primary, value_secondary: measurementType === "blood_pressure" ? secondary : null, unit, measured_at: measuredAt ?? new Date().toISOString(), notes: textValue(data.notes, 1000) };
}

async function audit(familyId: string, userId: string, action: string, entityType: string, entityId: string) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "health", private: true } }) });
}
