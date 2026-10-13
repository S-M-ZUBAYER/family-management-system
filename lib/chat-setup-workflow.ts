import {noticeObject,noticeUuid,noticeTimestamp} from "./notice-validation.ts";
const levels=["all","mentions","muted"];
const stamp=(v:unknown)=>{try{return typeof v==="string"&&!!noticeTimestamp(v);}catch{return false;}};
export class ChatSetupError extends Error {
  readonly code:string;readonly status:number;readonly channelId:string|null;
  constructor(code:string,status=400,channelId:string|null=null){super(code);this.name="ChatSetupError";this.code=code;this.status=status;this.channelId=channelId;}
}
export function chatCreateInput(raw:unknown){
  if(!noticeObject(raw)||raw.action!=="create_channel"||Object.keys(raw).some(k=>!["action","channelType","name","description","visibility","memberIds","clientChannelId"].includes(k))
    ||!["custom","admin","direct"].includes(raw.channelType as string)||!(raw.clientChannelId===undefined||noticeUuid(raw.clientChannelId))
    ||!Array.isArray(raw.memberIds)||raw.memberIds.length>1000||raw.memberIds.some(v=>typeof v!=="string"||!v||v.length>240||/[\x00-\x1f\x7f]/.test(v))||new Set(raw.memberIds).size!==raw.memberIds.length
    ||!(raw.description===undefined||raw.description===null||typeof raw.description==="string"&&raw.description.length<=500)
    ||!(raw.name===undefined||typeof raw.name==="string"&&raw.name.length<=100)||!(raw.visibility===undefined||["family","admins","invite_only"].includes(raw.visibility as string)))throw new ChatSetupError("CHAT_CHANNEL_INPUT");
  const type=raw.channelType as "custom"|"admin"|"direct",name=typeof raw.name==="string"?raw.name.trim():"";
  if(type!=="direct"&&name.length<2||type==="custom"&&raw.visibility==="admins")throw new ChatSetupError("CHAT_CHANNEL_INPUT");
  return {action:"create_channel" as const,channelType:type,name,description:typeof raw.description==="string"?raw.description.trim()||null:null,
    visibility:type==="admin"?"admins" as const:type==="direct"||raw.visibility==="invite_only"?"invite_only" as const:"family" as const,memberIds:[...raw.memberIds as string[]].sort(),clientChannelId:typeof raw.clientChannelId==="string"?raw.clientChannelId.toLowerCase():undefined};
}
export function chatChannelPublic(raw:unknown){
  if(!noticeObject(raw)||!noticeUuid(raw.id)||typeof raw.name!=="string"||!raw.name.trim()||raw.name.length>100||!(raw.description===null||typeof raw.description==="string"&&raw.description.length<=500)
    ||!["general","custom","admin","direct","event","qurbani"].includes(raw.channel_type as string)||!["family","admins","invite_only"].includes(raw.visibility as string)||!["active","archived"].includes(raw.status as string)||!stamp(raw.created_at)||!stamp(raw.updated_at))return null;
  return {id:raw.id,name:raw.name,description:raw.description as string|null,channel_type:raw.channel_type as string,visibility:raw.visibility as string,status:raw.status as string,created_at:raw.created_at as string,updated_at:raw.updated_at as string};
}
type Plan={id:string;familyId:string;actorId:string;name:string;description:string|null;channelType:"custom"|"admin"|"direct";visibility:"family"|"admins"|"invite_only";directKey:string|null;memberIds:string[]};
function channelMatches(raw:unknown,o:Plan,existing:boolean){
  return noticeObject(raw)&&!!chatChannelPublic(raw)&&raw.family_id===o.familyId&&raw.channel_type===o.channelType&&raw.visibility===o.visibility&&raw.status==="active"&&raw.direct_key===o.directKey
    &&(o.channelType==="direct"&&existing?o.memberIds.includes(raw.created_by_user_id as string):raw.id===o.id&&raw.created_by_user_id===o.actorId)
    &&(o.channelType==="direct"&&existing||raw.name===o.name&&raw.description===o.description);
}
function membersMatch(rows:unknown,o:Plan,id:string,creator:string,newSetup=false){
  if(!Array.isArray(rows)||rows.length!==o.memberIds.length)return false;
  const ids=new Set<string>();
  for(const r of rows){if(!noticeObject(r)||!noticeUuid(r.id)||r.family_id!==o.familyId||r.channel_id!==id||typeof r.auth_user_id!=="string"||ids.has(r.auth_user_id)||!o.memberIds.includes(r.auth_user_id)
      ||r.role!==(r.auth_user_id===creator?"owner":"member")||r.status!=="active"||!levels.includes(r.notification_level as string)||newSetup&&r.notification_level!=="all"||!stamp(r.created_at)||!stamp(r.updated_at))return false;ids.add(r.auth_user_id);}
  return true;
}
export async function chatCreateWrite(o:Plan&{readExisting:()=>Promise<unknown>;write:()=>Promise<unknown>;readMembers:(id:string)=>Promise<unknown>;writeMembers:(id:string)=>Promise<unknown>;audit:(id:string)=>Promise<unknown>;collision:(e:unknown)=>boolean;rejected:(e:unknown)=>boolean}){
  const replay=async(rows:unknown)=>{if(!Array.isArray(rows)||rows.length>1)throw new ChatSetupError("CHAT_SETUP_UNKNOWN",503);if(!rows.length)return null;const row=rows[0];if(!channelMatches(row,o,true))throw new ChatSetupError("CHAT_SETUP_CHANGED",409);
    if(o.memberIds.length&&!membersMatch(await o.readMembers(row.id as string),o,row.id as string,row.created_by_user_id as string))throw new ChatSetupError("CHAT_CHANNEL_SETUP_PENDING",503);
    return {success:true as const,action:"create_channel" as const,channelId:row.id as string,channel:chatChannelPublic(row)!,memberIds:o.memberIds,existing:true,verificationPending:true,auditPending:false};};
  const old=await replay(await o.readExisting());if(old)return old;
  let row:Record<string,unknown>;
  try{const rows=await o.write();if(!Array.isArray(rows)||rows.length!==1||!channelMatches(rows[0],o,false))throw new ChatSetupError("CHAT_SETUP_UNKNOWN",503);row=rows[0];}
  catch(error){if(error instanceof ChatSetupError)throw error;if(o.collision(error)){const found=await replay(await o.readExisting());if(found)return found;throw new ChatSetupError("CHAT_SETUP_CHANGED",409);}throw new ChatSetupError(o.rejected(error)?"CHAT_SETUP_REJECTED":"CHAT_SETUP_UNKNOWN",o.rejected(error)?400:503);}
  // Never delete a confirmed parent on member/audit failure: it may already
  // contain content. A partial private setup remains inaccessible for review.
  if(o.memberIds.length)try{if(!membersMatch(await o.writeMembers(row.id as string),o,row.id as string,o.actorId,true))throw Error("Unconfirmed member setup");}catch{throw new ChatSetupError("CHAT_CHANNEL_SETUP_PENDING",503,row.id as string);}
  let auditPending=false;try{await o.audit(row.id as string);}catch{auditPending=true;console.error("Chat channel saved; audit pending.");}
  return {success:true as const,action:"create_channel" as const,channelId:row.id as string,channel:chatChannelPublic(row)!,memberIds:o.memberIds,existing:false,verificationPending:false,auditPending};
}
export type ChatPreference={level:"all"|"mentions"|"muted";membershipId:string|null;updatedAt:string|null};
// Literal display-name marker, not structured recipient addressing or push delivery.
export function chatPreferenceAllowsNotification(level:unknown,body:unknown,displayName:unknown){
  if(level==="all")return true;if(level!=="mentions"||typeof body!=="string"||typeof displayName!=="string"||!displayName.trim())return false;
  return body.includes(`@[${displayName}]`);
}
export function chatPreferenceInput(raw:unknown){
  if(!noticeObject(raw)||raw.action!=="update_notification"||Object.keys(raw).some(k=>!["action","channelId","level","expectedLevel","expectedMembershipId","expectedUpdatedAt"].includes(k))
    ||!noticeUuid(raw.channelId)||!levels.includes(raw.level as string)||!levels.includes(raw.expectedLevel as string)||!(raw.expectedMembershipId===null||noticeUuid(raw.expectedMembershipId))
    ||!(raw.expectedUpdatedAt===null||stamp(raw.expectedUpdatedAt))||(raw.expectedMembershipId===null)!==(raw.expectedUpdatedAt===null))throw new ChatSetupError("CHAT_PREFERENCE_INPUT");
  return {action:"update_notification" as const,channelId:raw.channelId.toLowerCase(),level:raw.level as ChatPreference["level"],expectedLevel:raw.expectedLevel as string,expectedMembershipId:typeof raw.expectedMembershipId==="string"?raw.expectedMembershipId.toLowerCase():null,expectedUpdatedAt:raw.expectedUpdatedAt as string|null};
}
function preferenceRow(raw:unknown,family:string,channel:string,actor:string){return noticeObject(raw)&&noticeUuid(raw.id)&&raw.family_id===family&&raw.channel_id===channel&&raw.auth_user_id===actor&&["owner","moderator","member"].includes(raw.role as string)&&raw.status==="active"&&levels.includes(raw.notification_level as string)&&stamp(raw.created_at)&&stamp(raw.updated_at);}
export async function chatPreferenceWrite(o:{familyId:string;actorId:string;input:ReturnType<typeof chatPreferenceInput>;existing:unknown;newId:string;now?:number;write:(row:Record<string,unknown>|null,updatedAt:string)=>Promise<unknown>;audit:()=>Promise<unknown>;rejected:(e:unknown)=>boolean}){
  if(!Array.isArray(o.existing)||o.existing.length>1)throw new ChatSetupError("CHAT_SETUP_UNKNOWN",503);
  const row=o.existing[0]??null;if(row&&!preferenceRow(row,o.familyId,o.input.channelId,o.actorId))throw new ChatSetupError("CHAT_SETUP_CHANGED",409);
  if((row?.id??null)!==o.input.expectedMembershipId||(row?.updated_at??null)!==o.input.expectedUpdatedAt||(row?.notification_level??"all")!==o.input.expectedLevel)throw new ChatSetupError("CHAT_SETUP_CHANGED",409);
  const preference=(r:Record<string,unknown>|null):ChatPreference=>({level:(r?.notification_level??"all") as ChatPreference["level"],membershipId:r?.id as string??null,updatedAt:r?.updated_at as string??null});
  if(o.input.level===(row?.notification_level??"all"))return {success:true as const,action:"update_notification" as const,channelId:o.input.channelId,preference:preference(row),noChange:true,auditPending:false};
  const updatedAt=new Date(Math.max(o.now??Date.now(),row?Date.parse(row.updated_at as string)+1:0)).toISOString();let saved:Record<string,unknown>;
  try{const rows=await o.write(row,updatedAt);if(Array.isArray(rows)&&!rows.length)throw new ChatSetupError("CHAT_SETUP_CHANGED",409);
    if(!Array.isArray(rows)||rows.length!==1||!preferenceRow(rows[0],o.familyId,o.input.channelId,o.actorId)||rows[0].id!==(row?.id??o.newId)||rows[0].role!==(row?.role??"member")||rows[0].notification_level!==o.input.level
      ||Date.parse(rows[0].updated_at as string)!==Date.parse(updatedAt)||row&&rows[0].created_at!==row.created_at)throw new ChatSetupError("CHAT_SETUP_UNKNOWN",503);saved=rows[0];
  }catch(error){if(error instanceof ChatSetupError)throw error;throw new ChatSetupError(o.rejected(error)?"CHAT_SETUP_CHANGED":"CHAT_SETUP_UNKNOWN",o.rejected(error)?409:503);}
  let auditPending=false;try{await o.audit();}catch{auditPending=true;console.error("Chat preference saved; audit pending.");}
  return {success:true as const,action:"update_notification" as const,channelId:o.input.channelId,preference:preference(saved),noChange:false,auditPending};
}
export function chatSetupResponse(r:Awaited<ReturnType<typeof chatCreateWrite>>|Awaited<ReturnType<typeof chatPreferenceWrite>>){const pending=r.auditPending||r.action==="create_channel"&&r.verificationPending;return Response.json({...r,...(pending?{code:"CHAT_SETUP_PENDING"}:{})},{status:pending?202:r.action==="create_channel"?201:200});}
export function chatSetupAcknowledged(input:ReturnType<typeof chatCreateInput>|ReturnType<typeof chatPreferenceInput>,actor:string,status:number,raw:unknown){
  if(!noticeObject(raw)||raw.success!==true||raw.action!==input.action||raw.outcomeUnknown===true||typeof raw.auditPending!=="boolean"||!noticeUuid(raw.channelId))return false;
  if(input.action==="create_channel"){const c=chatChannelPublic(raw.channel),ids=input.visibility==="invite_only"?[...new Set([actor,...input.memberIds])].sort():[];
    return !!c&&c.id===raw.channelId&&c.channel_type===input.channelType&&c.visibility===input.visibility&&c.status==="active"&&(input.channelType==="direct"||c.name===input.name&&c.description===input.description)
      &&Array.isArray(raw.memberIds)&&JSON.stringify(raw.memberIds)===JSON.stringify(ids)&&typeof raw.existing==="boolean"&&typeof raw.verificationPending==="boolean"&&raw.existing===raw.verificationPending
      &&(input.channelType==="direct"&&raw.existing===true||!input.clientChannelId||raw.channelId===input.clientChannelId)&&[201,202].includes(status)&&(status===202)===(raw.auditPending||raw.verificationPending)&&(status!==202||raw.code==="CHAT_SETUP_PENDING");}
  if(raw.channelId!==input.channelId||!noticeObject(raw.preference)||raw.preference.level!==input.level||typeof raw.noChange!=="boolean"||raw.noChange!==(input.level===input.expectedLevel)||raw.noChange&&raw.auditPending!==false)return false;
  const p=raw.preference;if(!(p.membershipId===null||noticeUuid(p.membershipId))||!(p.updatedAt===null||stamp(p.updatedAt))||(p.membershipId===null)!==(p.updatedAt===null))return false;
  if(raw.noChange){if(p.membershipId!==input.expectedMembershipId||p.updatedAt!==input.expectedUpdatedAt)return false;}
  else if(!p.membershipId||!p.updatedAt||input.expectedMembershipId&&(p.membershipId!==input.expectedMembershipId||Date.parse(p.updatedAt as string)<=Date.parse(input.expectedUpdatedAt!)))return false;
  return [200,202].includes(status)&&(status===202)===raw.auditPending&&(status!==202||raw.code==="CHAT_SETUP_PENDING");
}
export async function readChatSetup(request:()=>Promise<Response>,input:ReturnType<typeof chatCreateInput>|ReturnType<typeof chatPreferenceInput>,actor:string){
  try{const response=await request();if(response.status===499)return {kind:"cancelled" as const};const raw:unknown=await response.json().catch(()=>null),p=noticeObject(raw)?raw:{};
    if(response.status>=500||response.status===408||p.outcomeUnknown===true)return {kind:"unknown" as const,channelId:noticeUuid(p.channelId)?p.channelId:null};
    if(!response.ok)return {kind:"rejected" as const,code:p.code};if(!chatSetupAcknowledged(input,actor,response.status,raw))return {kind:"unknown" as const,channelId:null};
    return {kind:"confirmed" as const,channelId:p.channelId as string,preference:input.action==="update_notification"?p.preference as ChatPreference:null,pending:response.status===202};
  }catch{return {kind:"unknown" as const,channelId:null};}
}
export function chatSetupCopy(code:unknown,locale:"bn"|"en"){const bn=locale==="bn";
  if(code==="CHAT_CHANNEL_INPUT")return bn?"Channel type/name/visibility ও active member নির্বাচন যাচাই করুন। Name ২–১০০, description সর্বোচ্চ ৫০০ অক্ষর; direct chat-এ একজন অন্য member দিন।":"Check channel type/name/visibility and active members. Name 2–100, description up to 500 characters; direct chat needs one other member.";
  if(code==="CHAT_PREFERENCE_INPUT")return bn?"Notification level ও আগের membership/version যাচাই করুন।":"Check notification level and previous membership/version.";
  if(code==="CHAT_SETUP_CHANGED")return bn?"Channel বা preference state বদলেছে। Reload করে মিলিয়ে দেখুন; আবার অন্ধভাবে পাঠাবেন না।":"Channel or preference state changed. Reload and review; do not blindly resubmit.";
  if(code==="CHAT_SETUP_REJECTED")return bn?"পরিবর্তন সংরক্ষণ হয়নি। Input ও অনুমতি যাচাই করুন।":"The change was not saved. Check input and permissions.";
  if(code==="CHAT_SETUP_PENDING")return bn?"Channel/preference সংরক্ষিত বা একই channel আগে থেকেই আছে। Audit/setup যাচাই বাকি; আবার create/save করবেন না।":"Channel/preference saved, or the channel already exists. Audit/setup needs review; do not repeat create/save.";
  return bn?"Channel setup বা preference-এর ফল নিশ্চিত নয়। Form রাখা হয়েছে। Reload করে যাচাই করুন; অসম্পূর্ণ private setup দেখা না গেলে support নিন। কোনো channel স্বয়ংক্রিয়ভাবে মুছে ফেলা বা setup/audit repair করা হবে না।":"Channel setup or preference outcome is uncertain. Form retained. Reload and review; contact support if incomplete private setup is not visible. No automatic channel deletion or setup/audit repair.";
}
export function chatSetupActionCopy(path:string,method:string,body:Record<string,unknown>,locale:"bn"|"en"){if(path!=="/api/chat"||method!=="POST"||!["create_channel","update_notification"].includes(body.action as string))return null;const bn=locale==="bn",create=body.action==="create_channel";
  return {title:create?bn?"নতুন channel তৈরি করবেন?":"Create this channel?":bn?"নিজের notification setting বদলাবেন?":"Change your notification setting?",description:create?bn?"Family/admin/private audience ও নির্বাচিত member যাচাই করুন। Cancel/× তৈরি করবে না।":"Check family/admin/private audience and selected members. Cancel/× does not create.":bn?"শুধু এই channel-এ আপনার preference বদলাবে। Role বা private access বদলাবে না; Cancel/× save করবে না।":"Only your preference in this channel changes. Role/private access remain unchanged; Cancel/× does not save.",confirmLabel:bn?"হ্যাঁ, নিশ্চিত করুন":"Yes, confirm",destructive:false,successMessage:create?bn?"Channel তৈরি হয়েছে।":"Channel created.":bn?"Notification setting সংরক্ষিত।":"Notification setting saved."};}
export function chatSetupFeedback(path:string,status:number,p:Record<string,unknown>,locale:"bn"|"en",method:string,body:Record<string,unknown>,actor:string){if(path!=="/api/chat"||method!=="POST"||!["create_channel","update_notification"].includes(body.action as string))return null;
  let ack=false;try{ack=chatSetupAcknowledged(body.action==="create_channel"?chatCreateInput(body):chatPreferenceInput(body),actor,status,p);}catch{/* Invalid input cannot acknowledge. */}
  if(status>=500||status===408||p.outcomeUnknown===true||status>=200&&status<300&&!ack)return {kind:"info" as const,title:locale==="bn"?"Chat setup যাচাই প্রয়োজন":"Verify chat setup",message:chatSetupCopy("CHAT_SETUP_UNKNOWN",locale)};
  if(status===202)return {kind:"info" as const,title:locale==="bn"?"সংরক্ষিত; কাজ বাকি":"Saved; work pending",message:chatSetupCopy("CHAT_SETUP_PENDING",locale)};
  if(status>=400)return {kind:"error" as const,title:locale==="bn"?"পরিবর্তন হয়নি":"No change made",message:chatSetupCopy(p.code??"CHAT_SETUP_REJECTED",locale)};
  if(p.noChange===true)return {kind:"info" as const,title:locale==="bn"?"আগেই এই setting ছিল":"Already in this setting",message:locale==="bn"?"নতুন পরিবর্তন বা audit তৈরি হয়নি।":"No new change or audit was created."};return null;
}
export function chatSetupVerification(raw:unknown,familyId:string,actor:string,input:ReturnType<typeof chatCreateInput>|ReturnType<typeof chatPreferenceInput>,requestedId:string|null){
  if(!noticeObject(raw)||!noticeObject(raw.family)||raw.family.id!==familyId||!noticeObject(raw.viewer)||raw.viewer.authUserId!==actor||raw.migrationRequired!==false||!Array.isArray(raw.channels)||raw.channels.length>20000)return null;
  const ids=input.action==="create_channel"?[...new Set([actor,...input.memberIds])].sort():[];
  for(const c of raw.channels){
    if(!noticeObject(c)||!noticeUuid(c.id)||!Array.isArray(c.memberIds)||!levels.includes(c.notificationLevel as string))continue;
    if(input.action==="update_notification"){if(c.id!==input.channelId)continue;const p=c.ownPreference;if(p===null&&c.notificationLevel==="all"||noticeObject(p)&&noticeUuid(p.membershipId)&&stamp(p.updatedAt))return c.id;continue;}
    if(c.channelType!==input.channelType||c.visibility!==input.visibility)continue;
    if(input.channelType!=="direct"&&(c.id!==requestedId||c.name!==input.name||c.description!==input.description))continue;
    if(input.visibility==="invite_only"&&(c.memberIds.some(v=>typeof v!=="string")||JSON.stringify([...c.memberIds].sort())!==JSON.stringify(ids)))continue;
    return c.id;
  }return null;
}
