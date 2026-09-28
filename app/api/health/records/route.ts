import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHealth, getActiveFamilyMembership } from "@/lib/family-access";
import { getChatAuthorName } from "@/lib/family-chat";
import type {
  HealthAppointment,
  HealthMeasurement,
  HealthMedication,
  HealthProfile,
  HealthSosAlert,
  HealthSosResponse,
} from "@/lib/health-types";
import { healthErrorResponse } from "../route";
import { supabaseRest } from "@/lib/supabase-rest";

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const numberValue = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const uuidValue = (value: unknown) => {
  const text = textValue(value, 50);
  return text && /^[0-9a-f-]{36}$/i.test(text) ? text : null;
};

function timestampValue(value: unknown) {
  const text = textValue(value, 50);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

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
      const height = numberValue(data.heightCm);
      const weight = numberValue(data.weightKg);
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
          date_of_birth: textValue(data.dateOfBirth, 10),
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
          last_donation_date: textValue(data.lastDonationDate, 10),
          visibility,
          updated_at: now,
        }),
      });
      return Response.json({ record: profile });
    }

    if (action === "create_medication") {
      const medicineName = textValue(data.medicineName, 180);
      const dosage = textValue(data.dosage, 120);
      const frequency = textValue(data.frequency, 120);
      const reminderTimes = Array.isArray(data.reminderTimes)
        ? data.reminderTimes.filter((value): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)).slice(0, 12)
        : [];
      if (!medicineName || !dosage || !frequency) {
        return Response.json({ error: "Medicine, dosage ও frequency প্রয়োজন।" }, { status: 400 });
      }
      const [record] = await supabaseRest<HealthMedication[]>("health_medications", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...owner,
          medicine_name: medicineName,
          dosage,
          frequency,
          reminder_times: reminderTimes,
          start_date: textValue(data.startDate, 10) ?? new Date().toISOString().slice(0, 10),
          end_date: textValue(data.endDate, 10),
          instructions: textValue(data.instructions, 2000),
          prescribing_doctor: textValue(data.prescribingDoctor, 180),
          status: "active",
        }),
      });
      return Response.json({ record }, { status: 201 });
    }

    if (action === "create_appointment") {
      const title = textValue(data.title, 180);
      const scheduledAt = timestampValue(data.scheduledAt);
      const reminderMinutes = numberValue(data.reminderMinutes) ?? 60;
      if (!title || !scheduledAt || scheduledAt === undefined || reminderMinutes === undefined || reminderMinutes < 0 || reminderMinutes > 10080) {
        return Response.json({ error: "Appointment title, date ও reminder সঠিকভাবে দিন।" }, { status: 400 });
      }
      const [record] = await supabaseRest<HealthAppointment[]>("health_appointments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...owner,
          title,
          doctor_name: textValue(data.doctorName, 180),
          facility: textValue(data.facility, 220),
          scheduled_at: scheduledAt,
          reminder_minutes: Math.round(reminderMinutes),
          notes: textValue(data.notes, 2000),
          status: "scheduled",
        }),
      });
      return Response.json({ record }, { status: 201 });
    }

    if (action === "create_measurement") {
      const measurementType = textValue(data.measurementType, 30);
      const primary = numberValue(data.valuePrimary);
      const secondary = numberValue(data.valueSecondary);
      const unit = textValue(data.unit, 30);
      const measuredAt = timestampValue(data.measuredAt) ?? new Date().toISOString();
      if (!measurementType || !["blood_pressure", "blood_sugar", "pulse", "temperature", "weight", "oxygen"].includes(measurementType) || primary === null || primary === undefined || secondary === undefined || !unit || measuredAt === undefined) {
        return Response.json({ error: "Measurement type, value, unit ও time সঠিকভাবে দিন।" }, { status: 400 });
      }
      const [record] = await supabaseRest<HealthMeasurement[]>("health_measurements", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...owner,
          measurement_type: measurementType,
          value_primary: primary,
          value_secondary: measurementType === "blood_pressure" ? secondary : null,
          unit,
          measured_at: measuredAt,
          notes: textValue(data.notes, 1000),
        }),
      });
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
      return Response.json({ record });
    }

    if (action === "create_sos") {
      const alertType = textValue(data.alertType, 20) ?? "medical";
      const message = textValue(data.message, 1000);
      const latitude = numberValue(data.latitude);
      const longitude = numberValue(data.longitude);
      const accuracy = numberValue(data.locationAccuracyM);
      if (!["medical", "accident", "fire", "safety", "other"].includes(alertType) || !message || message.length < 3) {
        return Response.json({ error: "SOS type ও সংক্ষিপ্ত message প্রয়োজন।" }, { status: 400 });
      }
      if (latitude === undefined || longitude === undefined || accuracy === undefined || (latitude !== null && (latitude < -90 || latitude > 90)) || (longitude !== null && (longitude < -180 || longitude > 180)) || ((latitude === null) !== (longitude === null))) {
        return Response.json({ error: "Location value সঠিক নয়।" }, { status: 400 });
      }
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
          latitude,
          longitude,
          location_accuracy_m: accuracy,
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
          metadata: { alert_type: alertType, has_location: latitude !== null },
        }),
      });
      return Response.json({ record: { ...record, is_reporter: true } }, { status: 201 });
    }

    if (action === "respond_sos") {
      const alertId = uuidValue(data.alertId);
      const responseType = textValue(data.responseType, 30);
      if (!alertId || !responseType || !["acknowledged", "on_the_way", "called_emergency", "update"].includes(responseType)) {
        return Response.json({ error: "SOS response সঠিক নয়।" }, { status: 400 });
      }
      const alertQuery = new URLSearchParams({
        select: "id,status",
        id: `eq.${alertId}`,
        family_id: `eq.${membership.family_id}`,
        limit: "1",
      });
      const alert = (await supabaseRest<Array<{ id: string; status: string }>>(`health_sos_alerts?${alertQuery}`))[0];
      if (!alert || ["resolved", "cancelled"].includes(alert.status)) return Response.json({ error: "SOS alert active নেই।" }, { status: 404 });
      const [record] = await supabaseRest<Array<HealthSosResponse & { responder_user_id: string }>>("health_sos_responses", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          family_id: membership.family_id,
          alert_id: alertId,
          responder_user_id: user.userId,
          responder_name: authorName,
          response_type: responseType,
          note: textValue(data.note, 1000),
        }),
      });
      if (alert.status === "active") {
        const now = new Date().toISOString();
        await supabaseRest(`health_sos_alerts?id=eq.${alertId}&family_id=eq.${membership.family_id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "acknowledged",
            acknowledged_by_user_id: user.userId,
            acknowledged_by_name: authorName,
            acknowledged_at: now,
            updated_at: now,
          }),
        });
      }
      const safeRecord = {
        id: record.id,
        alert_id: record.alert_id,
        responder_name: record.responder_name,
        response_type: record.response_type,
        note: record.note,
        created_at: record.created_at,
      };
      return Response.json({ record: { ...safeRecord, is_mine: true } }, { status: 201 });
    }

    if (action === "update_sos") {
      const alertId = uuidValue(data.alertId);
      const status = textValue(data.status, 20);
      if (!alertId || !status || !["resolved", "cancelled"].includes(status)) {
        return Response.json({ error: "SOS update সঠিক নয়।" }, { status: 400 });
      }
      const alertQuery = new URLSearchParams({
        select: "id,reporter_user_id,status",
        id: `eq.${alertId}`,
        family_id: `eq.${membership.family_id}`,
        limit: "1",
      });
      const alert = (await supabaseRest<Array<{ id: string; reporter_user_id: string; status: string }>>(`health_sos_alerts?${alertQuery}`))[0];
      if (!alert) return Response.json({ error: "SOS alert পাওয়া যায়নি।" }, { status: 404 });
      if (alert.reporter_user_id !== user.userId && !canManageHealth(membership.role)) {
        return Response.json({ error: "SOS close করার permission নেই।" }, { status: 403 });
      }
      const now = new Date().toISOString();
      const [record] = await supabaseRest<HealthSosAlert[]>(
        `health_sos_alerts?id=eq.${alertId}&family_id=eq.${membership.family_id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            status,
            resolved_by_user_id: user.userId,
            resolved_at: now,
            resolution_note: textValue(data.note, 1000),
            updated_at: now,
          }),
        },
      );
      return Response.json({ record });
    }

    return Response.json({ error: "Unsupported health action." }, { status: 400 });
  } catch (error) {
    return healthErrorResponse(error, "Unable to update health workspace");
  }
}
