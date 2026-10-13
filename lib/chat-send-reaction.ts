import {noticeObject,noticeUuid,noticeTimestamp} from "./notice-validation.ts";
import {chatMessagePublic} from "./chat-text-management.ts";
export class ChatFlowError extends Error {
  readonly code:string;readonly status:number;
  constructor(code:string,status=400){super(code);this.name="ChatFlowError";this.code=code;this.status=status;}
}
const emojis=["❤️","👍","😂","🤲","🎉"];
export function chatSendInput(raw:unknown) {
  if(!noticeObject(raw)||raw.action!=="send_message"||Object.keys(raw).some(k=>!["action","channelId","body","replyToId","clientMessageId"].includes(k))
    ||!noticeUuid(raw.channelId)||typeof raw.body!=="string"||!raw.body.trim()||raw.body.length>5000
    ||!(raw.replyToId===undefined||raw.replyToId===null||noticeUuid(raw.replyToId))||!(raw.clientMessageId===undefined||noticeUuid(raw.clientMessageId)))throw new ChatFlowError("CHAT_SEND_INPUT");
  return {action:"send_message" as const,channelId:raw.channelId.toLowerCase(),body:raw.body.trim(),replyToId:typeof raw.replyToId==="string"?raw.replyToId.toLowerCase():null,clientMessageId:typeof raw.clientMessageId==="string"?raw.clientMessageId.toLowerCase():undefined};
}
export function chatReactionInput(raw:unknown) {
  if(!noticeObject(raw)||raw.action!=="toggle_reaction"||Object.keys(raw).some(k=>!["action","channelId","messageId","emoji","active","expectedReactionId"].includes(k))
    ||!noticeUuid(raw.channelId)||!noticeUuid(raw.messageId)||!emojis.includes(raw.emoji as string)||typeof raw.active!=="boolean"||!(raw.expectedReactionId===null||noticeUuid(raw.expectedReactionId)))throw new ChatFlowError("CHAT_REACTION_INPUT");
  return {action:"toggle_reaction" as const,channelId:raw.channelId.toLowerCase(),messageId:raw.messageId.toLowerCase(),emoji:raw.emoji as string,active:raw.active,expectedReactionId:typeof raw.expectedReactionId==="string"?raw.expectedReactionId.toLowerCase():null};
}
export function chatReactionPublic(raw:unknown) {
  if(!noticeObject(raw)||!noticeUuid(raw.id)||!noticeUuid(raw.message_id)||!emojis.includes(raw.emoji as string)||typeof raw.created_at!=="string")return null;
  try{if(!noticeTimestamp(raw.created_at))return null;}catch{return null;}
  return {id:raw.id,message_id:raw.message_id,emoji:raw.emoji as string,created_at:raw.created_at,is_mine:true};
}
type Scope={familyId:string;channelId:string;actorId:string};
function sendRow(raw:unknown,o:Scope&{id:string;input:ReturnType<typeof chatSendInput>}) {
  const p=chatMessagePublic(raw,true);
  return noticeObject(raw)&&p&&raw.id===o.id&&raw.family_id===o.familyId&&raw.channel_id===o.channelId&&raw.auth_user_id===o.actorId
    &&p.message_type==="text"&&p.body===o.input.body&&p.reply_to_id===o.input.replyToId&&p.edited_at===null?p:null;
}
// Reuse is bounded by the saved message primary key, not a permanent request
// ledger. Deleting that message removes its deduplication record.
export async function chatSendWrite(o:Scope&{id:string;authorName:string;input:ReturnType<typeof chatSendInput>;readExisting:()=>Promise<unknown>;write:()=>Promise<unknown>;sync:()=>Promise<unknown>;audit:()=>Promise<unknown>;rejected:(e:unknown)=>boolean;collision:(e:unknown)=>boolean}) {
  const replay=async(rows:unknown)=>{
    if(!Array.isArray(rows)||rows.length>1)throw new ChatFlowError("CHAT_FLOW_UNKNOWN",503);
    if(!rows.length)return null;
    const p=sendRow(rows[0],o);if(!p)throw new ChatFlowError("CHAT_FLOW_CHANGED",409);
    return {success:true as const,action:"send_message" as const,channelId:o.channelId,message:p,replayed:true,verificationPending:true,auditPending:false,syncPending:false};
  };
  const existing=await replay(await o.readExisting());if(existing)return existing;
  let message:NonNullable<ReturnType<typeof chatMessagePublic>>;
  try{
    const rows=await o.write(),p=Array.isArray(rows)&&rows.length===1?sendRow(rows[0],o):null;
    if(!p||p.author_name!==o.authorName)throw new ChatFlowError("CHAT_FLOW_UNKNOWN",503);message=p;
  }catch(error){
    if(error instanceof ChatFlowError)throw error;
    if(o.collision(error)){const saved=await replay(await o.readExisting());if(saved)return saved;throw new ChatFlowError("CHAT_FLOW_CHANGED",409);}
    throw new ChatFlowError(o.rejected(error)?"CHAT_FLOW_REJECTED":"CHAT_FLOW_UNKNOWN",o.rejected(error)?400:503);
  }
  let syncPending=false,auditPending=false;
  try{await o.sync();}catch{syncPending=true;console.error("Chat message saved; channel refresh pending.");}
  try{await o.audit();}catch{auditPending=true;console.error("Chat message saved; audit pending.");}
  return {success:true as const,action:"send_message" as const,channelId:o.channelId,message,replayed:false,verificationPending:false,syncPending,auditPending};
}
function reactionRow(raw:unknown,o:Scope&{input:ReturnType<typeof chatReactionInput>}) {
  const p=chatReactionPublic(raw);return noticeObject(raw)&&p&&raw.family_id===o.familyId&&raw.auth_user_id===o.actorId&&p.message_id===o.input.messageId&&p.emoji===o.input.emoji?p:null;
}
export async function chatReactionWrite(o:Scope&{input:ReturnType<typeof chatReactionInput>;existing:unknown;newId:string;write:(existing:Record<string,unknown>|null)=>Promise<unknown>;audit:()=>Promise<unknown>;rejected:(e:unknown)=>boolean}) {
  if(!Array.isArray(o.existing)||o.existing.length>1)throw new ChatFlowError("CHAT_FLOW_UNKNOWN",503);
  const raw=o.existing[0]??null,current=raw===null?null:reactionRow(raw,o);
  if(raw!==null&&!current)throw new ChatFlowError("CHAT_FLOW_UNKNOWN",503);
  if((current?.id??null)!==o.input.expectedReactionId)throw new ChatFlowError("CHAT_FLOW_CHANGED",409);
  if(o.input.active===!!current)return {success:true as const,action:"toggle_reaction" as const,channelId:o.channelId,messageId:o.input.messageId,emoji:o.input.emoji,active:o.input.active,id:current?.id??null,reaction:current,noChange:true,auditPending:false};
  let returned:NonNullable<ReturnType<typeof chatReactionPublic>>;
  try{
    const rows=await o.write(raw);
    if(Array.isArray(rows)&&!rows.length)throw new ChatFlowError("CHAT_FLOW_CHANGED",409);
    const p=Array.isArray(rows)&&rows.length===1?reactionRow(rows[0],o):null;
    if(!p||p.id!==(current?.id??o.newId)||(!o.input.active&&p.created_at!==current?.created_at))throw new ChatFlowError("CHAT_FLOW_UNKNOWN",503);returned=p;
  }catch(error){if(error instanceof ChatFlowError)throw error;throw new ChatFlowError(o.rejected(error)?"CHAT_FLOW_CHANGED":"CHAT_FLOW_UNKNOWN",o.rejected(error)?409:503);}
  let auditPending=false;try{await o.audit();}catch{auditPending=true;console.error("Chat reaction changed; audit pending.");}
  return {success:true as const,action:"toggle_reaction" as const,channelId:o.channelId,messageId:o.input.messageId,emoji:o.input.emoji,active:o.input.active,id:returned.id,reaction:o.input.active?returned:null,noChange:false,auditPending};
}
export function chatFlowResponse(result:Awaited<ReturnType<typeof chatSendWrite>>|Awaited<ReturnType<typeof chatReactionWrite>>) {
  const pending=result.auditPending||(result.action==="send_message"&&(result.syncPending||result.verificationPending));
  const status=pending?202:result.action==="send_message"||result.active&&!result.noChange?201:200;
  return Response.json({...result,...(pending?{code:"CHAT_FLOW_PENDING"}:{})},{status});
}
export function chatFlowAcknowledged(input:ReturnType<typeof chatSendInput>|ReturnType<typeof chatReactionInput>,status:number,raw:unknown) {
  if(!noticeObject(raw)||raw.success!==true||raw.action!==input.action||raw.channelId!==input.channelId||raw.outcomeUnknown===true||typeof raw.auditPending!=="boolean")return false;
  if(input.action==="send_message"){
    const p=chatMessagePublic(raw.message);
    return !!p&&p.is_mine&&p.message_type==="text"&&p.channel_id===input.channelId&&p.body===input.body&&p.reply_to_id===input.replyToId&&p.edited_at===null&&(!input.clientMessageId||p.id===input.clientMessageId)
      &&typeof raw.replayed==="boolean"&&typeof raw.verificationPending==="boolean"&&typeof raw.syncPending==="boolean"&&raw.verificationPending===raw.replayed
      &&[201,202].includes(status)&&(status===202)===(raw.auditPending||raw.syncPending||raw.verificationPending)&&(status!==202||raw.code==="CHAT_FLOW_PENDING");
  }
  if(raw.messageId!==input.messageId||raw.emoji!==input.emoji||raw.active!==input.active||typeof raw.noChange!=="boolean"||!(raw.id===null||noticeUuid(raw.id)))return false;
  if(raw.noChange!==(input.active===!!input.expectedReactionId)||raw.noChange&&raw.auditPending!==false)return false;
  const p=chatReactionPublic(raw.reaction);
  if(input.active){if(!p||p.id!==raw.id||p.message_id!==input.messageId||p.emoji!==input.emoji||!noticeObject(raw.reaction)||raw.reaction.is_mine!==true||raw.noChange&&raw.id!==input.expectedReactionId)return false;}
  else if(raw.reaction!==null||raw.id!==input.expectedReactionId)return false;
  return [200,201,202].includes(status)&&(status===202)===raw.auditPending&&(status!==202||raw.code==="CHAT_FLOW_PENDING")&&(status===202||status===(raw.noChange||!input.active?200:201));
}
export async function readChatFlow(request:()=>Promise<Response>,input:ReturnType<typeof chatSendInput>|ReturnType<typeof chatReactionInput>) {
  try{const response=await request();if(response.status===499)return {kind:"cancelled" as const};const raw:unknown=await response.json().catch(()=>null),payload=noticeObject(raw)?raw:{};
    if(response.status>=500||response.status===408||payload.outcomeUnknown===true)return {kind:"unknown" as const};
    if(!response.ok)return {kind:"rejected" as const,code:payload.code};
    if(!chatFlowAcknowledged(input,response.status,raw))return {kind:"unknown" as const};
    return {kind:"confirmed" as const,message:input.action==="send_message"?chatMessagePublic(payload.message):null,reaction:input.action==="toggle_reaction"&&input.active?chatReactionPublic(payload.reaction):null,pending:response.status===202};
  }catch{return {kind:"unknown" as const};}
}
export function chatFlowCopy(code:unknown,locale:"bn"|"en") {
  const bn=locale==="bn";
  if(code==="CHAT_SEND_INPUT")return bn?"Channel, reply, request ID ও সর্বোচ্চ ৫০০০ অক্ষরের message যাচাই করুন।":"Check channel, reply, request ID and message (maximum 5,000 characters).";
  if(code==="CHAT_REACTION_INPUT")return bn?"Reaction, add/remove state ও আগের reaction ID যাচাই করুন।":"Check emoji, desired add/remove state and previous reaction ID.";
  if(code==="CHAT_FLOW_CHANGED")return bn?"Message request বা reaction state বদলেছে। Reload করে যাচাই করুন; অন্ধভাবে আবার পাঠাবেন না।":"The message request or reaction state changed. Reload and review; do not blindly resubmit.";
  if(code==="CHAT_FLOW_PENDING")return bn?"পরিবর্তন সংরক্ষিত বা একই request-এর message আগে থেকেই আছে। Audit/channel refresh যাচাই বাকি; আবার পাঠাবেন না।":"Change saved, or this request's message already exists. Audit/channel refresh needs review; do not resend.";
  if(code==="CHAT_FLOW_REJECTED")return bn?"পরিবর্তন সংরক্ষণ হয়নি। Input ও অনুমতি যাচাই করুন।":"The change was not saved. Check input and permissions.";
  return bn?"পাঠানো বা reaction-এর ফল নিশ্চিত নয়। Draft রাখা হয়েছে। Channel reload করে অবস্থা মিলিয়ে দেখুন; একই request ID রাখুন, অন্ধভাবে আবার পাঠাবেন না। Reload audit ঠিক করে না।":"Send or reaction outcome is uncertain. Draft retained. Reload the channel and review; keep the same request ID and do not blindly resend. Reload does not repair audits.";
}
export function chatFlowActionCopy(path:string,method:string,body:Record<string,unknown>,locale:"bn"|"en") {
  if(path!=="/api/chat"||method!=="POST"||!["send_message","toggle_reaction"].includes(body.action as string))return null;
  const bn=locale==="bn",send=body.action==="send_message",remove=body.active===false;
  return {title:send?bn?"Channel-এ message পাঠাবেন?":"Send this message to the channel?":remove?bn?"নিজের reaction সরাবেন?":"Remove your reaction?":bn?"Reaction যোগ করবেন?":"Add your reaction?",description:send?bn?"অনুমোদিত participant-রা message দেখবেন। প্রাপক ও লেখা যাচাই করুন। Cancel/× পাঠাবে না।":"Authorized participants can see this message. Check recipients and text. Cancel/× does not send.":bn?"শুধু আপনার এই emoji-র state বদলাবে। আগের state বদলে গেলে request বাতিল হবে; Cancel/× বদলাবে না।":"Only your state for this emoji changes. A changed previous state rejects the request; Cancel/× makes no change.",confirmLabel:bn?"হ্যাঁ, নিশ্চিত করুন":"Yes, confirm",destructive:false,successMessage:send?bn?"Message পাঠানো হয়েছে।":"Message sent.":remove?bn?"Reaction সরেছে।":"Reaction removed.":bn?"Reaction যোগ হয়েছে।":"Reaction added."};
}
export function chatFlowFeedback(path:string,status:number,raw:Record<string,unknown>,locale:"bn"|"en",method:string,body:Record<string,unknown>) {
  if(path!=="/api/chat"||method!=="POST"||!["send_message","toggle_reaction"].includes(body.action as string))return null;
  let ack=false;try{ack=chatFlowAcknowledged(body.action==="send_message"?chatSendInput(body):chatReactionInput(body),status,raw);}catch{/* Invalid input cannot acknowledge. */}
  if(status>=500||status===408||raw.outcomeUnknown===true||status>=200&&status<300&&!ack)return {kind:"info" as const,title:locale==="bn"?"Chat পরিবর্তন যাচাই করুন":"Verify chat change",message:chatFlowCopy("CHAT_FLOW_UNKNOWN",locale)};
  if(status===202)return {kind:"info" as const,title:locale==="bn"?"সংরক্ষিত; যাচাই বাকি":"Saved; review pending",message:chatFlowCopy("CHAT_FLOW_PENDING",locale)};
  if(status>=400)return {kind:"error" as const,title:locale==="bn"?"পরিবর্তন হয়নি":"No change made",message:chatFlowCopy(raw.code??"CHAT_FLOW_REJECTED",locale)};
  if(raw.noChange===true)return {kind:"info" as const,title:locale==="bn"?"আগেই এই state ছিল":"Already in this state",message:locale==="bn"?"নতুন পরিবর্তন বা audit তৈরি হয়নি।":"No new change or audit was created."};
  return null;
}
