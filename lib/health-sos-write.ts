import { noticeObject, noticeUuid } from "./notice-validation.ts";
import { healthNumber, healthTimestamp } from "./health-validation.ts";
import { healthRecordsEqual } from "./health-record-write.ts";
import { healthSosLocation, publicHealthSosRecord } from "./health-sos-workflow.ts";
import type { HealthSosAlert, HealthSosResponse } from "./health-types.ts";

type Rest = <T>(path: string, init?: RequestInit) => Promise<T>;
type Scope = { familyId: string; actorId: string };
const actions = ["create_sos", "respond_sos", "update_sos"];
const alertFields = ["id", "reporter_name", "alert_type", "message", "preferred_contact", "latitude", "longitude", "location_accuracy_m", "location_label", "status", "acknowledged_by_name", "acknowledged_at", "resolved_at", "resolution_note", "created_at", "updated_at", "is_reporter"];
const responseFields = ["id", "alert_id", "responder_name", "response_type", "note", "created_at", "is_mine"];
export class HealthSosWriteError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
const text = (v: unknown, max: number, min = 0) => v === null && min === 0 || typeof v === "string" && v.trim().length >= min && v.length <= max;
const stamp = (v: unknown, nullable = false) => v === null && nullable || typeof v === "string" && !!healthTimestamp(v);
export function healthSosAlertPublic(v: unknown): HealthSosAlert | null {
  if (!noticeObject(v) || !noticeUuid(v.id) || !text(v.reporter_name,180,1) || !["medical","accident","fire","safety","other"].includes(v.alert_type as string) || !text(v.message,1000,3) || !text(v.preferred_contact,50) || !text(v.location_label,300) || !["active","acknowledged","resolved","cancelled"].includes(v.status as string) || !text(v.acknowledged_by_name,180) || !text(v.resolution_note,1000) || !stamp(v.acknowledged_at,true) || !stamp(v.resolved_at,true) || !stamp(v.created_at) || !stamp(v.updated_at) || typeof v.is_reporter!=="boolean" || ["latitude","longitude","location_accuracy_m"].some(k=>v[k]===undefined)) return null;
  try { healthSosLocation({latitude:v.latitude,longitude:v.longitude,locationAccuracyM:v.location_accuracy_m}); } catch { return null; }
  return Object.fromEntries(alertFields.map(k=>[k,v[k]])) as HealthSosAlert;
}
export function healthSosResponsePublic(v: unknown): HealthSosResponse | null {
  if(!noticeObject(v)||!noticeUuid(v.id)||!noticeUuid(v.alert_id)||!text(v.responder_name,180,1)||!["acknowledged","on_the_way","called_emergency","update","resolved"].includes(v.response_type as string)||!text(v.note,1000)||!stamp(v.created_at)||typeof v.is_mine!=="boolean")return null;
  return Object.fromEntries(responseFields.map(k=>[k,v[k]])) as HealthSosResponse;
}
export function healthSosInput(raw: unknown, actual?: Scope) {
  if(!noticeObject(raw)||!actions.includes(raw.action as string)||!noticeObject(raw.data)||Object.keys(raw).some(k=>!["action","data","expectedScope","expectedAlert"].includes(k)))throw new HealthSosWriteError("HEALTH_SOS_INPUT");
  const scope=raw.expectedScope;
  if(!noticeObject(scope)||!noticeUuid(scope.familyId)||typeof scope.actorId!=="string"||!scope.actorId||scope.actorId.length>240||/[\u0000-\u001f\u007f]/.test(scope.actorId)||actual&&(scope.familyId!==actual.familyId||scope.actorId!==actual.actorId))throw new HealthSosWriteError("HEALTH_SOS_CONTEXT",409);
  const data=raw.data,action=raw.action as "create_sos"|"respond_sos"|"update_sos";
  const allowed=action==="create_sos"?["alertType","message","preferredContact","latitude","longitude","locationAccuracyM","locationLabel"]:action==="respond_sos"?["alertId","responseType","note"]:["alertId","status","note"];
  if(Object.keys(data).some(k=>!allowed.includes(k)))throw new HealthSosWriteError("HEALTH_SOS_INPUT");
  const optional=(v:unknown,max:number)=>{if(v===undefined||v===null||v==="")return null;if(typeof v!=="string"||v.trim().length>max)throw new HealthSosWriteError("HEALTH_SOS_INPUT");return v.trim()||null;};
  const expected=raw.expectedAlert===null?null:healthSosAlertPublic(raw.expectedAlert);
  if(!Object.hasOwn(raw,"expectedAlert")||raw.expectedAlert!==null&&(!expected||!noticeObject(raw.expectedAlert)||Object.keys(raw.expectedAlert).some(k=>!alertFields.includes(k))))throw new HealthSosWriteError("HEALTH_SOS_INPUT");
  const scoped={familyId:scope.familyId,actorId:scope.actorId};
  if(action==="create_sos"){
    if(expected!==null||typeof data.message!=="string"||data.message.trim().length<3||data.message.trim().length>1000||typeof data.alertType!=="string"||!["medical","accident","fire","safety","other"].includes(data.alertType))throw new HealthSosWriteError("HEALTH_SOS_INPUT");
    let location:ReturnType<typeof healthSosLocation>;try{location=healthSosLocation(data);}catch{throw new HealthSosWriteError("HEALTH_SOS_LOCATION");}
    return {action,scope:scoped,expected,alertId:null,values:{alert_type:data.alertType,message:data.message.trim(),preferred_contact:optional(data.preferredContact,50),...location,location_label:optional(data.locationLabel,300)}};
  }
  if(!noticeUuid(data.alertId)||!expected||expected.id!==data.alertId)throw new HealthSosWriteError("HEALTH_SOS_INPUT");
  if(!["active","acknowledged"].includes(expected.status))throw new HealthSosWriteError("HEALTH_SOS_CLOSED",409);
  const note=optional(data.note,1000);
  if(action==="respond_sos"){
    if(typeof data.responseType!=="string"||!["acknowledged","on_the_way","called_emergency","update"].includes(data.responseType))throw new HealthSosWriteError("HEALTH_SOS_INPUT");
    return {action,scope:scoped,expected,alertId:data.alertId,values:{response_type:data.responseType,note}};
  }
  if(data.status!=="resolved"&&data.status!=="cancelled")throw new HealthSosWriteError("HEALTH_SOS_INPUT");
  return {action,scope:scoped,expected,alertId:data.alertId,values:{status:data.status,resolution_note:note}};
}
function equals(a:Record<string,unknown>,b:Record<string,unknown>){
  return Object.entries(a).every(([k,v])=>["latitude","longitude","location_accuracy_m"].includes(k)?v===null?b[k]===null:healthNumber(v)===healthNumber(b[k]):healthRecordsEqual({[k]:v},{[k]:b[k]}));
}
function ownAlert(raw:unknown,scope:Scope){
  if(!noticeObject(raw)||raw.family_id!==scope.familyId||typeof raw.reporter_user_id!=="string"||!raw.reporter_user_id)return null;
  return healthSosAlertPublic(publicHealthSosRecord(raw,scope.actorId));
}
export async function writeHealthSos(o:{rest:Rest;input:ReturnType<typeof healthSosInput>;authorName:string;canManage:boolean;authorize:()=>Promise<void>;rejected:(e:unknown)=>boolean;newId?:string;now?:number}){
  const {input,rest}=o,{scope,action}=input;
  let existing:Record<string,unknown>|null=null;
  if(input.alertId){
    const q=new URLSearchParams({select:"*",id:`eq.${input.alertId}`,family_id:`eq.${scope.familyId}`,limit:"1"});
    const rows=await rest<unknown[]>(`health_sos_alerts?${q}`),raw=Array.isArray(rows)?rows[0]:null,alert=ownAlert(raw,scope);
    if(!alert||!noticeObject(raw)||alert.id!==input.alertId)throw new HealthSosWriteError("HEALTH_SOS_NOT_FOUND",404);
    if(!["active","acknowledged"].includes(alert.status))throw new HealthSosWriteError("HEALTH_SOS_CLOSED",409);
    if(!equals(input.expected as unknown as Record<string,unknown>,alert as unknown as Record<string,unknown>))throw new HealthSosWriteError("HEALTH_SOS_CHANGED",409);
    if(action==="update_sos"&&raw.reporter_user_id!==scope.actorId&&!o.canManage)throw new HealthSosWriteError("HEALTH_SOS_FORBIDDEN",403);
    existing=raw;
  }
  const now=new Date(Math.max(o.now??Date.now(),existing?Date.parse(String(existing.updated_at))+1:0)).toISOString();
  const id=action==="update_sos"?input.alertId!:o.newId??crypto.randomUUID();
  if(!noticeUuid(id)||!text(o.authorName,180,1))throw new HealthSosWriteError("HEALTH_SOS_INPUT");
  const q=existing?new URLSearchParams({id:`eq.${existing.id}`,family_id:`eq.${scope.familyId}`,reporter_user_id:`eq.${existing.reporter_user_id}`,status:`eq.${existing.status}`,updated_at:`eq.${existing.updated_at}`}):null;
  await o.authorize();
  let record:HealthSosAlert|HealthSosResponse;
  const values:Record<string,unknown>=action==="create_sos"?{...input.values,id,family_id:scope.familyId,reporter_user_id:scope.actorId,reporter_name:o.authorName,status:"active",created_at:now,updated_at:now}:action==="respond_sos"?{...input.values,id,family_id:scope.familyId,alert_id:input.alertId,responder_user_id:scope.actorId,responder_name:o.authorName,created_at:now}:{...input.values,resolved_by_user_id:scope.actorId,resolved_at:now,updated_at:now};
  try{
    const rows=await rest<unknown[]>(action==="respond_sos"?"health_sos_responses":action==="create_sos"?"health_sos_alerts":`health_sos_alerts?${q}`,{method:action==="update_sos"?"PATCH":"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(values)});
    if(Array.isArray(rows)&&rows.length===0&&existing&&action==="update_sos")throw new HealthSosWriteError("HEALTH_SOS_CHANGED",409);
    if(!Array.isArray(rows)||rows.length!==1||!noticeObject(rows[0])||rows[0].id!==id||rows[0].family_id!==scope.familyId||!equals(values,rows[0]))throw new HealthSosWriteError("HEALTH_SOS_UNKNOWN",503);
    const saved=rows[0];
    if(action==="respond_sos"){
      const response=healthSosResponsePublic({...rows[0],is_mine:rows[0].responder_user_id===scope.actorId});if(!response)throw new HealthSosWriteError("HEALTH_SOS_UNKNOWN",503);record=response;
    }else{
      const alert=ownAlert(saved,scope);if(!alert||existing&&["reporter_user_id","reporter_name","created_at","alert_type","message","preferred_contact","latitude","longitude","location_accuracy_m","location_label","acknowledged_by_name","acknowledged_at"].some(k=>!equals({[k]:existing![k]},{[k]:saved[k]})))throw new HealthSosWriteError("HEALTH_SOS_UNKNOWN",503);record=alert;
    }
  }catch(e){if(e instanceof HealthSosWriteError)throw e;throw new HealthSosWriteError(o.rejected(e)?"HEALTH_SOS_REJECTED":"HEALTH_SOS_UNKNOWN",o.rejected(e)?409:503);}
  let parentPending=false,auditPending=false;
  if(action==="respond_sos"&&existing?.status==="active"){
    try{
      await o.authorize();
      const changes={status:"acknowledged",acknowledged_by_user_id:scope.actorId,acknowledged_by_name:o.authorName,acknowledged_at:now,updated_at:now};
      const rows=await rest<unknown[]>(`health_sos_alerts?${q}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(changes)});
      const frozen=Object.fromEntries(["family_id","reporter_user_id","reporter_name","created_at","alert_type","message","preferred_contact","latitude","longitude","location_accuracy_m","location_label","resolved_at","resolution_note","resolved_by_user_id"].map(k=>[k,existing![k]]));
      if(!Array.isArray(rows)||rows.length!==1||!noticeObject(rows[0])||rows[0].id!==input.alertId||!ownAlert(rows[0],scope)||!equals(changes,rows[0])||!equals(frozen,rows[0]))throw new Error("Parent acknowledgement pending.");
    }catch{parentPending=true;console.error("SOS response saved; parent acknowledgement needs review.");}
  }
  try{
    const auditAction=action==="create_sos"?"health_sos_created":action==="respond_sos"?"health_sos_response_created":`health_sos_${input.values.status}`;
    const rows=await rest<unknown[]>("audit_logs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({family_id:scope.familyId,actor_user_id:scope.actorId,action:auditAction,entity_type:action==="respond_sos"?"health_sos_response":"health_sos_alert",entity_id:id,metadata:{module:"health",scope:"family_sos",parent_pending:parentPending}})});
    if(!Array.isArray(rows)||rows.length!==1||!noticeObject(rows[0])||!noticeUuid(rows[0].id)||rows[0].family_id!==scope.familyId||rows[0].actor_user_id!==scope.actorId||rows[0].entity_id!==id||rows[0].action!==auditAction)throw new Error("SOS audit acknowledgement missing.");
  }catch{auditPending=true;console.error("SOS record saved; audit pending.");}
  return {success:true,action,id,scope,record,parentPending,auditPending,...(parentPending||auditPending?{code:"HEALTH_SOS_PENDING"}:{})};
}
export function healthSosAcknowledged(body:unknown,status:number,raw:unknown){
  let input:ReturnType<typeof healthSosInput>;try{input=healthSosInput(body);}catch{return false;}
  if(!noticeObject(raw)||raw.success!==true||raw.action!==input.action||!noticeUuid(raw.id)||!noticeObject(raw.scope)||raw.scope.familyId!==input.scope.familyId||raw.scope.actorId!==input.scope.actorId||raw.outcomeUnknown===true||typeof raw.auditPending!=="boolean"||typeof raw.parentPending!=="boolean"||(status===202)!==(raw.auditPending||raw.parentPending)||status===202&&raw.code!=="HEALTH_SOS_PENDING"||input.action!=="respond_sos"&&raw.parentPending)return false;
  if(input.action==="respond_sos"){
    const r=healthSosResponsePublic(raw.record);return !!r&&noticeObject(raw.record)&&Object.keys(raw.record).every(k=>responseFields.includes(k))&&r.id===raw.id&&r.alert_id===input.alertId&&r.is_mine&&equals(input.values,r as unknown as Record<string,unknown>)&&[201,202].includes(status);
  }
  const r=healthSosAlertPublic(raw.record);
  if(!r||!noticeObject(raw.record)||Object.keys(raw.record).some(k=>!alertFields.includes(k))||r.id!==raw.id||!equals(input.values,r as unknown as Record<string,unknown>))return false;
  return input.action==="create_sos"?r.status==="active"&&r.is_reporter&&[201,202].includes(status):r.id===input.alertId&&r.is_reporter===input.expected!.is_reporter&&!!r.resolved_at&&[200,202].includes(status);
}
export function healthSosWriteCopy(code:unknown,locale:"bn"|"en"){
  const copies:Record<string,[string,string]>={
    HEALTH_SOS_UNKNOWN:["SOS save/response/close-এর ফল নিশ্চিত নয়। আবার পাঠাবেন না; বর্তমান SOS তালিকা review করুন। এই system জরুরি সেবায় কল বা SMS/email পাঠায় না।","The SOS save/response/close outcome is uncertain. Do not repeat it; review the current SOS list. This system does not call emergency services or send SMS/email."],
    HEALTH_SOS_PENDING:["SOS record/response-এর পরিবর্তন নিশ্চিত; parent status বা audit বাকি। আবার পাঠাবেন না; তালিকা review করে Support-এ জানান। এটি সাহায্য পৌঁছানো বা বাহ্যিক delivery-এর প্রমাণ নয়।","The SOS record/response change is confirmed; parent status or audit is pending. Do not repeat it; review the list and contact support. This does not confirm dispatched help or external delivery."],
    HEALTH_SOS_CHANGED:["SOS ইতিমধ্যে বদলেছে। বর্তমান তালিকা reload করে সঠিক alert আবার খুলুন।","The SOS already changed. Reload the current list and reopen the correct alert."],
    HEALTH_SOS_CONTEXT:["SOS-এর family/account বদলেছে। বর্তমান Health workspace reload করুন।","The SOS family/account changed. Reload the current Health workspace."],
    HEALTH_SOS_INPUT:["সঠিক SOS type/message, response/status এবং সম্পূর্ণ বর্তমান alert দিন। Message/note সর্বোচ্চ ১০০০ অক্ষর।","Use a valid SOS type/message, response/status and complete current alert. Message/note: maximum 1,000 characters."],
    HEALTH_SOS_REJECTED:["Database SOS পরিবর্তন প্রত্যাখ্যান করেছে। বর্তমান তালিকা review করুন।","The database rejected the SOS change. Review the current list."],
  };
  return typeof code==="string"&&Object.hasOwn(copies,code)?copies[code][locale==="bn"?0:1]:null;
}
export function healthSosFeedback(path:string,status:number,raw:unknown,locale:"bn"|"en",method:string,body:unknown){
  if(path!=="/api/health/records"||method!=="POST"||!noticeObject(body)||!actions.includes(body.action as string))return null;
  const p=noticeObject(raw)?raw:{};
  if(status>=500||status===408||p.outcomeUnknown===true||status>=200&&status<300&&!healthSosAcknowledged(body,status,raw))return{kind:"info" as const,title:locale==="bn"?"SOS ফল review করুন":"Review SOS outcome",message:healthSosWriteCopy("HEALTH_SOS_UNKNOWN",locale)!};
  if(status===202)return{kind:"info" as const,title:locale==="bn"?"SOS সংরক্ষিত; কাজ বাকি":"SOS saved; work pending",message:healthSosWriteCopy("HEALTH_SOS_PENDING",locale)!};
  const message=healthSosWriteCopy(p.code,locale);return status>=400&&message?{kind:"error" as const,title:"Error",message}:null;
}
export async function readHealthSosMutation(request:()=>Promise<Response>,body:unknown){
  try{const r=await request();if(r.status===499)return{kind:"cancelled" as const,payload:{}};const raw:unknown=await r.json().catch(()=>null),payload=noticeObject(raw)?raw:{};
    if(r.status>=500||r.status===408||payload.outcomeUnknown===true||r.ok&&!healthSosAcknowledged(body,r.status,raw))return{kind:"unknown" as const,payload};
    return{kind:r.ok?"confirmed" as const:"rejected" as const,payload};
  }catch{return{kind:"unknown" as const,payload:{}};}
}
