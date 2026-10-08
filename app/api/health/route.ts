import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHealth, getActiveFamilyMembership } from "@/lib/family-access";
import { getChatAuthorName } from "@/lib/family-chat";
import { publicHealthSosRecord } from "@/lib/health-sos-workflow";
import { visibleEmergencyDirectory, type EmergencyDirectoryRow } from "@/lib/health-directory-visibility";
import type {
  EmergencyHealthProfile,
  HealthAppointment,
  HealthDocument,
  HealthMeasurement,
  HealthMedication,
  HealthProfile,
  HealthSosAlert,
  HealthSosResponse,
} from "@/lib/health-types";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

async function readAllHealthRows<T>(table: string, query: URLSearchParams): Promise<T[]> {
  return collectPaginatedRows(
    (offset, limit) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set("offset", String(offset));
      pageQuery.set("limit", String(limit));
      return supabaseRest<T[]>(`${table}?${pageQuery}`);
    },
    { pageSize: 500, maxRows: 20000 },
  );
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json(
        { code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" },
        { status: 409 },
      );
    }

    const familyQuery = new URLSearchParams({
      select: "id,name_bn,name_en",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const family = (
      await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(
        `families?${familyQuery}`,
      )
    )[0];
    const owner = {
      family_id: `eq.${membership.family_id}`,
      auth_user_id: `eq.${user.userId}`,
    };

    let profile: HealthProfile | null = null;
    let medications: HealthMedication[] = [];
    let appointments: HealthAppointment[] = [];
    let measurements: HealthMeasurement[] = [];
    let documents: HealthDocument[] = [];
    let emergencyDirectory: EmergencyHealthProfile[] = [];
    let sosRows: Array<HealthSosAlert & { reporter_user_id: string }> = [];
    let responseRows: Array<HealthSosResponse & { responder_user_id: string }> = [];
    let migrationRequired = false;

    try {
      const profileQuery = new URLSearchParams({
        select: "id,member_name,blood_group,date_of_birth,height_cm,weight_kg,conditions,allergies,emergency_notes,doctor_name,doctor_phone,emergency_contact_name,emergency_contact_phone,donor_available,last_donation_date,visibility,updated_at",
        ...owner,
        limit: "1",
      });
      const medicationQuery = new URLSearchParams({
        select: "id,medicine_name,dosage,frequency,reminder_times,start_date,end_date,instructions,prescribing_doctor,status,created_at,updated_at",
        ...owner,
        order: "status.asc,created_at.desc,id.asc",
      });
      const appointmentQuery = new URLSearchParams({
        select: "id,title,doctor_name,facility,scheduled_at,reminder_minutes,status,notes,created_at,updated_at",
        ...owner,
        order: "scheduled_at.asc,id.asc",
      });
      const measurementQuery = new URLSearchParams({
        select: "id,measurement_type,value_primary,value_secondary,unit,measured_at,notes,created_at",
        ...owner,
        order: "measured_at.desc,id.asc",
      });
      const documentQuery = new URLSearchParams({
        select: "id,file_name,mime_type,file_size,category,title,document_date,notes,created_at",
        ...owner,
        order: "document_date.desc.nullslast,created_at.desc,id.asc",
      });
      const directoryQuery = new URLSearchParams({
        select: "auth_user_id,member_name,blood_group,conditions,allergies,emergency_notes,emergency_contact_name,emergency_contact_phone,donor_available,last_donation_date,visibility",
        family_id: `eq.${membership.family_id}`,
        or: "(visibility.neq.private,donor_available.eq.true)",
        order: "member_name.asc,id.asc",
      });
      const emergencyOptOutQuery = new URLSearchParams({
        select: "user_id",
        family_id: `eq.${membership.family_id}`,
        allow_emergency_access: "eq.false",
        order: "user_id.asc",
      });
      const sosQuery = new URLSearchParams({
        select: "id,reporter_user_id,reporter_name,alert_type,message,preferred_contact,latitude,longitude,location_accuracy_m,location_label,status,acknowledged_by_name,acknowledged_at,resolved_at,resolution_note,created_at,updated_at",
        family_id: `eq.${membership.family_id}`,
        order: "created_at.desc,id.asc",
      });
      const responseQuery = new URLSearchParams({
        select: "id,alert_id,responder_user_id,responder_name,response_type,note,created_at",
        family_id: `eq.${membership.family_id}`,
        order: "created_at.asc,id.asc",
      });
      const [profiles, medicationRows, appointmentRows, measurementRows, documentRows, directoryRows, emergencyOptOuts, alerts, responses] = await Promise.all([
        supabaseRest<HealthProfile[]>(`health_profiles?${profileQuery}`),
        readAllHealthRows<HealthMedication>("health_medications", medicationQuery),
        readAllHealthRows<HealthAppointment>("health_appointments", appointmentQuery),
        readAllHealthRows<HealthMeasurement>("health_measurements", measurementQuery),
        readAllHealthRows<HealthDocument>("health_documents", documentQuery),
        readAllHealthRows<EmergencyDirectoryRow>("health_profiles", directoryQuery),
        readAllHealthRows<{ user_id: string }>("family_privacy_consents", emergencyOptOutQuery),
        readAllHealthRows<typeof sosRows[number]>("health_sos_alerts", sosQuery),
        readAllHealthRows<typeof responseRows[number]>("health_sos_responses", responseQuery),
      ]);
      profile = profiles[0] ?? null;
      medications = medicationRows;
      appointments = appointmentRows;
      measurements = measurementRows;
      documents = documentRows;
      emergencyDirectory = visibleEmergencyDirectory(directoryRows, emergencyOptOuts.map((entry) => entry.user_id));
      sosRows = alerts;
      responseRows = responses;
    } catch (error) {
      if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true;
      else throw error;
    }

    return Response.json({
      family,
      viewer: {
        displayName: await getChatAuthorName(membership.family_id, user),
        role: membership.role,
      },
      profile,
      medications,
      appointments,
      measurements,
      documents,
      emergencyDirectory,
      sosAlerts: sosRows.map((alert) => publicHealthSosRecord(alert, user.userId)),
      sosResponses: responseRows.map(({ responder_user_id, ...response }) => ({
        ...response,
        is_mine: responder_user_id === user.userId,
      })),
      permissions: { canManageSos: canManageHealth(membership.role) },
      migrationRequired,
    });
  } catch (error) {
    return healthErrorResponse(error, "Unable to load health workspace");
  }
}

export function healthErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof PaginatedRowLimitError) {
    return Response.json({ code: "HEALTH_ROW_LIMIT", maxRows: error.maxRows, error: `Health history exceeds ${error.maxRows} rows in one section. No partial data was shown; contact support for a paged export.` }, { status: 413 });
  }
  if (error instanceof BackendNotConfiguredError) {
    return Response.json({ error: "PostgreSQL backend configured নয়।" }, { status: 503 });
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json({ error: "Health data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(logMessage, error);
  return Response.json({ error: "Health request সম্পন্ন হয়নি।" }, { status: 500 });
}
