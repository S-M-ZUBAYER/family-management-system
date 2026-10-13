import { noticeObject, noticeUuid, noticeTimestamp } from "./notice-validation.ts";
import { chatMessagePublic } from "./chat-text-management.ts";
import { chatAttachmentKey, chatAttachmentPublic } from "./chat-attachment-policy.ts";

export class ChatAttachmentDeleteError extends Error {
  readonly code:string;readonly status:number;
  constructor(code:string,status=400){super(code);this.name="ChatAttachmentDeleteError";this.code=code;this.status=status;}
}
const timestamp=(raw:unknown)=>{try{return typeof raw==="string"&&!!noticeTimestamp(raw);}catch{return false;}};
export function chatAttachmentDeleteInput(raw:unknown) {
  if(!noticeObject(raw)||Object.keys(raw).some(k=>!["expectedMessageId","expectedBody","expectedEditedAt","expectedCreatedAt","expectedFileCreatedAt"].includes(k))
    ||!noticeUuid(raw.expectedMessageId)||!(raw.expectedBody===null||typeof raw.expectedBody==="string"&&raw.expectedBody.length<=5000)
    ||!(raw.expectedEditedAt===null||timestamp(raw.expectedEditedAt))||!timestamp(raw.expectedCreatedAt)||!timestamp(raw.expectedFileCreatedAt))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_INPUT");
  return {expectedMessageId:raw.expectedMessageId,expectedBody:raw.expectedBody as string|null,expectedEditedAt:raw.expectedEditedAt as string|null,expectedCreatedAt:raw.expectedCreatedAt as string,expectedFileCreatedAt:raw.expectedFileCreatedAt as string};
}
export function chatAttachmentMayDelete(message:unknown,file:unknown,actor:string) {
  return !!actor&&noticeObject(message)&&noticeObject(file)&&message.message_type==="attachment"&&message.auth_user_id===actor&&file.uploaded_by_user_id===actor
    &&file.message_id===message.id&&file.channel_id===message.channel_id&&file.family_id===message.family_id&&!!chatMessagePublic(message,true)&&!!chatAttachmentPublic(file);
}
export function chatAttachmentDeleteMatches(input:ReturnType<typeof chatAttachmentDeleteInput>,message:Record<string,unknown>,file:Record<string,unknown>) {
  return message.id===input.expectedMessageId&&message.body===input.expectedBody&&message.edited_at===input.expectedEditedAt
    &&message.created_at===input.expectedCreatedAt&&file.created_at===input.expectedFileCreatedAt;
}
export async function chatAttachmentDeleteWrite(o:{message:Record<string,unknown>;file:Record<string,unknown>;write:()=>Promise<unknown>;cleanup:()=>Promise<unknown>;audit:(cleanupPending:boolean)=>Promise<unknown>;sync:()=>Promise<unknown>;rejected:(e:unknown)=>boolean}) {
  if(!chatAttachmentKey(o.file.storage_key,o.message.family_id as string,o.message.channel_id as string)||!chatAttachmentMayDelete(o.message,o.file,o.message.auth_user_id as string))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_INPUT");
  try {
    const rows=await o.write();
    if(Array.isArray(rows)&&!rows.length)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_CHANGED",409);
    if(!Array.isArray(rows)||rows.length!==1||!noticeObject(rows[0])||!chatMessagePublic(rows[0],true)
      ||["id","family_id","channel_id","auth_user_id","author_name","message_type","body","reply_to_id","edited_at","created_at"].some(k=>rows[0][k]!==o.message[k]))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_UNKNOWN",503);
  } catch(error) {
    if(error instanceof ChatAttachmentDeleteError)throw error;
    throw new ChatAttachmentDeleteError(o.rejected(error)?"CHAT_FILE_DELETE_REJECTED":"CHAT_FILE_DELETE_UNKNOWN",o.rejected(error)?400:503);
  }
  // Metadata access and parent references are already removed. Only the captured
  // key may be cleaned, and cleanup/audit/refresh failures do not replay DELETE.
  let cleanupPending=false,auditPending=false,syncPending=false;
  try{await o.cleanup();}catch{cleanupPending=true;console.error("Chat file access removed; storage cleanup pending.");}
  try{await o.audit(cleanupPending);}catch{auditPending=true;console.error("Chat file access removed; audit pending.");}
  try{await o.sync();}catch{syncPending=true;console.error("Chat file access removed; channel refresh pending.");}
  return {success:true as const,deleted:true as const,id:o.file.id as string,messageId:o.message.id as string,channelId:o.message.channel_id as string,cleanupPending,auditPending,syncPending};
}
export function chatAttachmentDeleteResponse(result:Awaited<ReturnType<typeof chatAttachmentDeleteWrite>>) {
  const pending=result.cleanupPending||result.auditPending||result.syncPending;
  return Response.json({...result,...(pending?{code:"CHAT_FILE_DELETE_PENDING"}:{})},{status:pending?202:200});
}
export function chatAttachmentDeleteAcknowledged(id:string,channel:string,input:ReturnType<typeof chatAttachmentDeleteInput>,status:number,raw:unknown) {
  return noticeUuid(id)&&noticeUuid(channel)&&noticeObject(raw)&&raw.success===true&&raw.deleted===true&&raw.id===id&&raw.messageId===input.expectedMessageId&&raw.channelId===channel&&raw.outcomeUnknown!==true
    &&[200,202].includes(status)&&!["cleanupPending","auditPending","syncPending"].some(k=>typeof raw[k]!=="boolean")
    &&(status===202)===(raw.cleanupPending===true||raw.auditPending===true||raw.syncPending===true)&&(status!==202||raw.code==="CHAT_FILE_DELETE_PENDING");
}
export async function readChatAttachmentDeletion(request:()=>Promise<Response>,id:string,channel:string,input:ReturnType<typeof chatAttachmentDeleteInput>) {
  try{
    const response=await request();if(response.status===499)return {kind:"cancelled" as const};
    const raw:unknown=await response.json().catch(()=>null),payload=noticeObject(raw)?raw:{};
    if(payload.code==="CHAT_FILE_DELETE_STORAGE")return {kind:"rejected" as const,code:payload.code};
    if(response.status>=500||response.status===408||payload.outcomeUnknown===true)return {kind:"unknown" as const};
    if(!response.ok)return {kind:"rejected" as const,code:typeof payload.code==="string"?payload.code:"CHAT_FILE_DELETE_REJECTED"};
    if(!chatAttachmentDeleteAcknowledged(id,channel,input,response.status,raw))return {kind:"unknown" as const};
    return {kind:"confirmed" as const,pending:response.status===202};
  }catch{return {kind:"unknown" as const};}
}
export function chatAttachmentDeleteCopy(code:unknown,locale:"bn"|"en") {
  const bn=locale==="bn";
  if(code==="CHAT_FILE_DELETE_INPUT")return bn?"File message ও তার বর্তমান version যাচাই করুন।":"Check the file message and its current version.";
  if(code==="CHAT_FILE_DELETE_FORBIDDEN")return bn?"শুধু নিজের পাঠানো message এবং নিজের upload করা file মুছতে পারবেন।":"You may delete only your own message containing your own uploaded file.";
  if(code==="CHAT_FILE_DELETE_NOT_FOUND")return bn?"File পাওয়া যায়নি বা এই channel-এ প্রবেশাধিকার নেই।":"File not found or this channel is not accessible.";
  if(code==="CHAT_FILE_DELETE_CHANGED")return bn?"Message বা file বদলেছে। Reload করে যাচাই করুন।":"The message or file changed. Reload and review.";
  if(code==="CHAT_FILE_DELETE_MULTIPLE")return bn?"এই message-এ একাধিক বা অসম্পূর্ণ file link আছে; support-এর সহায়তা নিন।":"This message has multiple or incomplete file links; contact support.";
  if(code==="CHAT_FILE_DELETE_STORAGE"||code==="CHAT_FILE_DELETE_REJECTED")return bn?"File মুছে ফেলা হয়নি। Storage বা অনুমতি যাচাই করুন।":"The file was not deleted. Check storage or permissions.";
  if(code==="CHAT_FILE_DELETE_PENDING")return bn?"File message-এর প্রবেশাধিকার সরেছে। Storage cleanup, audit বা channel refresh বাকি; delete আবার পাঠাবেন না।":"File-message access was removed. Storage cleanup, audit or channel refresh is pending; do not repeat deletion.";
  return bn?"File delete-এর ফল নিশ্চিত নয়। Channel reload করে যাচাই করুন; আবার delete পাঠাবেন না। Reload file cleanup বা audit ঠিক করে না।":"File deletion outcome is uncertain. Reload the channel and review; do not repeat deletion. Reload does not repair file cleanup or audit.";
}
export function chatAttachmentDeleteActionCopy(path:string,method:string,locale:"bn"|"en") {
  if(!/^\/api\/chat-file\/[^/]+$/.test(path)||method!=="DELETE")return null;
  const bn=locale==="bn";
  return {title:bn?"নিজের file message স্থায়ীভাবে মুছবেন?":"Permanently delete your file message?",description:bn?"সব participant-এর history থেকে file ও caption সরবে। Reaction সরবে; reply-reference খুলবে। সংরক্ষিত download ফেরত নেওয়া যায় না। Undo নেই; Cancel/× মুছবে না।":"File and caption leave every participant's history. Reactions are removed and reply references cleared. Previously saved downloads cannot be recalled. No undo; Cancel/× does not delete.",confirmLabel:bn?"হ্যাঁ, স্থায়ীভাবে মুছুন":"Yes, permanently delete",destructive:true,successMessage:bn?"File message মুছে ফেলা হয়েছে।":"File message deleted."};
}
export function chatAttachmentDeleteFeedback(path:string,status:number,raw:Record<string,unknown>,locale:"bn"|"en",method="",body:unknown=null) {
  const match=/^\/api\/chat-file\/([^/]+)$/.exec(path);if(!match||method!=="DELETE")return null;
  let acknowledged=false;try{acknowledged=chatAttachmentDeleteAcknowledged(match[1],raw.channelId as string,chatAttachmentDeleteInput(body),status,raw);}catch{/* Invalid input cannot acknowledge. */}
  if(raw.code==="CHAT_FILE_DELETE_STORAGE"||status>=400&&status<500&&status!==408)return {kind:"error" as const,title:locale==="bn"?"File মুছে ফেলা হয়নি":"File not deleted",message:chatAttachmentDeleteCopy(raw.code,locale)};
  if(status>=500||status===408||raw.outcomeUnknown===true||status>=200&&status<300&&!acknowledged)return {kind:"info" as const,title:locale==="bn"?"File delete যাচাই প্রয়োজন":"Verify file deletion",message:chatAttachmentDeleteCopy("CHAT_FILE_DELETE_UNKNOWN",locale)};
  if(status===202)return {kind:"info" as const,title:locale==="bn"?"File সরেছে; কাজ বাকি":"File removed; work pending",message:chatAttachmentDeleteCopy("CHAT_FILE_DELETE_PENDING",locale)};
  return null;
}
