import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHealth, getActiveFamilyMembership } from "@/lib/family-access";
import { getChatAuthorName } from "@/lib/family-chat";
import { healthErrorResponse } from "../route";
import { supabaseRest, SupabaseRequestError } from "@/lib/supabase-rest";
import { HealthRecordWriteError, healthOrdinaryKind, healthRecordTables, healthWriteContext, healthRecordWrite, healthRecordWriteResponse, type HealthRecordKind } from "@/lib/health-record-write";
import { healthDate, healthDecimal, healthReminderMinutes, healthReminderTimes, healthTimestamp, healthUuid } from "@/lib/health-validation";

import { healthSosInput, writeHealthSos, HealthSosWriteError, healthSosWriteCopy } from "@/lib/health-sos-write";

type EditableHealthKind = "medication" | "appointment" | "measurement";
const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const timestampValue = healthTimestamp;

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    const body = raw as Record<string, unknown>;
    const ordinaryKind = healthOrdinaryKind("POST", body);
    if (ordinaryKind) return await writeOrdinaryHealth("POST", body, ordinaryKind, membership.family_id, user.userId);
    if (["create_sos","respond_sos","update_sos"].includes(body.action as string)) {
      const input=healthSosInput(body,{familyId:membership.family_id,actorId:user.userId});
      const authorName=await getChatAuthorName(membership.family_id,user);
      const result=await writeHealthSos({rest:supabaseRest,input,authorName,canManage:canManageHealth(membership.role),
        authorize:async()=>{const current=await getActiveFamilyMembership(user.userId);if(!current||current.family_id!==membership.family_id||current.role!==membership.role)throw new HealthSosWriteError("HEALTH_SOS_CONTEXT",409);},
        rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
      });
      return Response.json(result,{status:result.auditPending||result.parentPending?202:input.action==="update_sos"?200:201,headers:{"Cache-Control":"no-store"}});
    }

    return Response.json({ error: "Unsupported health action." }, { status: 400 });
  } catch (error) {
    if (error instanceof HealthRecordWriteError) return Response.json({ code: error.code, outcomeUnknown: error.code === "HEALTH_WRITE_UNKNOWN" }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    if (error instanceof HealthSosWriteError) return Response.json({code:error.code,error:healthSosWriteCopy(error.code,"en"),outcomeUnknown:error.code==="HEALTH_SOS_UNKNOWN"},{status:error.status});
    return healthErrorResponse(error, "Unable to update health workspace");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    const ordinaryBody = raw as Record<string, unknown>, ordinaryKind = healthOrdinaryKind("PATCH", ordinaryBody);
    if (!ordinaryKind) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    return await writeOrdinaryHealth("PATCH", ordinaryBody, ordinaryKind, membership.family_id, user.userId);
  } catch (error) {
    if (error instanceof HealthRecordWriteError) return Response.json({ code: error.code, outcomeUnknown: error.code === "HEALTH_WRITE_UNKNOWN" }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    return healthErrorResponse(error, "Unable to update health record");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    const ordinaryBody = raw as Record<string, unknown>, ordinaryKind = healthOrdinaryKind("DELETE", ordinaryBody);
    if (!ordinaryKind) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    return await writeOrdinaryHealth("DELETE", ordinaryBody, ordinaryKind, membership.family_id, user.userId);
  } catch (error) {
    if (error instanceof HealthRecordWriteError) return Response.json({ code: error.code, outcomeUnknown: error.code === "HEALTH_WRITE_UNKNOWN" }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
    return healthErrorResponse(error, "Unable to delete health record");
  }
}

async function writeOrdinaryHealth(method: string, body: Record<string, unknown>, kind: HealthRecordKind, familyId: string, actorId: string): Promise<Response> {
  const expected = healthWriteContext(body, familyId, actorId, kind);
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data as Record<string, unknown> : {};
  const isCreate = method === "POST" && body.action !== "update_status" && kind !== "profile";
  const recordId = method === "PATCH" || method === "DELETE" ? healthUuid(body.recordId) : body.action === "update_status" ? healthUuid(data.id) : expected?.id;
  if ((!isCreate && kind !== "profile" && (!recordId || !expected || expected.id !== recordId)) || isCreate && expected !== null) throw new HealthRecordWriteError("HEALTH_WRITE_EXPECTATION", 400);
  const table = healthRecordTables[kind];
  const q = new URLSearchParams({select:"*",family_id:`eq.${familyId}`,auth_user_id:`eq.${actorId}`,limit:"2"});
  if (recordId) q.set("id",`eq.${recordId}`);
  let existing: unknown = null;
  if (!isCreate) {
    const rows = await supabaseRest<unknown[]>(`${table}?${q}`);
    if (!Array.isArray(rows) || rows.length > 1) throw new HealthRecordWriteError("HEALTH_RECORD_CHANGED");
    existing = rows[0] ?? null;
  }
  let changes: Record<string, unknown> | Response = {};
  if (method !== "DELETE") {
    const textLimits:Record<string,number>=kind==="profile"?{visibility:20,bloodGroup:8,conditions:4000,allergies:4000,emergencyNotes:4000,doctorName:180,doctorPhone:50,emergencyContactName:180,emergencyContactPhone:50}:kind==="medication"?{medicineName:180,dosage:120,frequency:120,instructions:2000,prescribingDoctor:180}:kind==="appointment"?{title:180,doctorName:180,facility:220,notes:2000}:{measurementType:30,unit:30,notes:1000};
    for(const [key,max]of Object.entries(textLimits)){const value=data[key];if(value!==undefined&&value!==null&&(typeof value!=="string"||value.trim().length>max))throw new HealthRecordWriteError("HEALTH_WRITE_EXPECTATION",400);}
    if (kind === "profile") changes = healthProfileChanges(data);
    else if (body.action === "update_status") {
      const values = kind === "medication" ? ["active","paused","completed"] : ["scheduled","completed","cancelled"];
      if (typeof data.status !== "string" || !values.includes(data.status)) throw new HealthRecordWriteError("HEALTH_WRITE_EXPECTATION",400);
      changes = {status:data.status};
    } else changes = healthRecordChanges(kind, data);
    if (changes instanceof Response) return changes;
  }
  if (isCreate) { if (kind === "medication") changes.status="active"; if(kind === "appointment") changes.status="scheduled"; }
  const current = await getActiveFamilyMembership(actorId);
  if(!current || current.family_id!==familyId) throw new HealthRecordWriteError("HEALTH_WRITE_CONTEXT");
  const result = await healthRecordWrite({kind,familyId,actorId,expected,existing,changes,deletion:method==="DELETE",
    rejected:e=>e instanceof SupabaseRequestError && e.status>=400 && e.status<500 && e.status!==408,
    write:async (values,filter)=> {
      if (method==="DELETE") return supabaseRest(`${table}?${filter}`,{method:"DELETE",headers:{Prefer:"return=representation"}});
      if (filter) return supabaseRest(`${table}?${filter}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(values)});
      const user=await getChatGPTUser();
      if(!user||user.userId!==actorId) throw new HealthRecordWriteError("HEALTH_WRITE_CONTEXT");
      const memberName=kind==="profile" ? await getChatAuthorName(familyId,user) : null;
      return supabaseRest(table,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({...values,family_id:familyId,auth_user_id:actorId,...(memberName?{member_name:memberName}:{})})});
    },
    audit:id=>audit(familyId,actorId,kind==="profile"?"health_profile_saved":`health_${kind}_${method==="DELETE"?"deleted":body.action==="update_status"?"status_updated":isCreate?"created":"updated"}`,table,id),
  });
  return healthRecordWriteResponse(result,isCreate?201:200);
}

function healthProfileChanges(data: Record<string, unknown>): Record<string, unknown> | Response {
  const visibility=textValue(data.visibility,20)??"private",bloodGroup=textValue(data.bloodGroup,8),height=healthDecimal(data.heightCm),weight=healthDecimal(data.weightKg),dateOfBirth=healthDate(data.dateOfBirth),lastDonationDate=healthDate(data.lastDonationDate);
  if(dateOfBirth===undefined||lastDonationDate===undefined)return Response.json({code:"HEALTH_INVALID_DATE"},{status:400});
  if(!["private","emergency","family"].includes(visibility)||bloodGroup&&!["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].includes(bloodGroup)||height===undefined||weight===undefined||height!==null&&(height<30||height>300)||weight!==null&&(weight<1||weight>700)||typeof data.donorAvailable!=="boolean")return Response.json({code:"HEALTH_WRITE_EXPECTATION"},{status:400});
  return {blood_group:bloodGroup,date_of_birth:dateOfBirth,height_cm:height,weight_kg:weight,conditions:textValue(data.conditions,4000),allergies:textValue(data.allergies,4000),emergency_notes:textValue(data.emergencyNotes,4000),doctor_name:textValue(data.doctorName,180),doctor_phone:textValue(data.doctorPhone,50),emergency_contact_name:textValue(data.emergencyContactName,180),emergency_contact_phone:textValue(data.emergencyContactPhone,50),donor_available:data.donorAvailable,last_donation_date:lastDonationDate,visibility};
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
  const rows = await supabaseRest<Array<Record<string,unknown>>>("audit_logs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "health", private: true } }) });
  if(!Array.isArray(rows)||rows.length!==1||!healthUuid(rows[0].id)||rows[0].family_id!==familyId||rows[0].actor_user_id!==userId||rows[0].entity_id!==entityId||rows[0].action!==action)throw new Error("Health audit acknowledgement missing.");
}
