import { noticeObject, noticeUuid, noticeTimestamp } from "./notice-validation.ts";
import { eventMediaHeaderMatches } from "./event-media-workflow.ts";
import { chatMessagePublic } from "./chat-text-management.ts";

export class ChatAttachmentError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.name = "ChatAttachmentError"; this.code = code; this.status = status; }
}
const extensions: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/gif": ["gif"],
  "audio/mpeg": ["mp3"], "audio/mp4": ["m4a", "mp4"], "audio/x-m4a": ["m4a"], "audio/webm": ["webm"], "audio/ogg": ["ogg"], "audio/wav": ["wav"],
  "video/mp4": ["mp4"], "video/webm": ["webm"], "application/pdf": ["pdf"], "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};
export function chatAttachmentMetadata(file: { name: string; type: string; size: number }) {
  if (typeof file.name !== "string" || typeof file.type !== "string") throw new ChatAttachmentError("CHAT_FILE_INVALID");
  // MediaRecorder may supply a codec parameter; all other MIME parameters reject.
  const type = file.type.replace(/^(audio\/(?:webm|ogg));\s*codecs=(?:opus|vorbis)$/i, "$1").toLowerCase();
  if (!Object.hasOwn(extensions, type) || !file.name.trim() || file.name.length > 220 || /[\x00-\x1f\x7f/\\]/.test(file.name)
    || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > (type.startsWith("video/") ? 25 : type.startsWith("audio/") ? 15 : type.startsWith("image/") ? 8 : 10) * 1024 * 1024)
    throw new ChatAttachmentError("CHAT_FILE_INVALID");
  const suffix = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : null;
  if (suffix !== null && !extensions[type].includes(suffix)) throw new ChatAttachmentError("CHAT_FILE_INVALID");
  return { name: file.name, type, size: file.size, extension: extensions[type][0] };
}
export function chatAttachmentInput(form: FormData) {
  for (const key of form.keys()) if (!["channelId", "replyToId", "file", "caption"].includes(key) || form.getAll(key).length !== 1) throw new ChatAttachmentError("CHAT_FILE_INPUT");
  const channelId = form.get("channelId"), reply = form.get("replyToId"), caption = form.get("caption"), file = form.get("file");
  if (!noticeUuid(channelId) || !(reply === null || noticeUuid(reply)) || !(file instanceof File)
    || !(caption === null || typeof caption === "string" && caption.length <= 2000)) throw new ChatAttachmentError("CHAT_FILE_INPUT");
  return { channelId, replyToId: reply as string | null, caption: typeof caption === "string" ? caption.trim() || null : null, file, metadata: chatAttachmentMetadata(file) };
}
// Bounded container/header checks only: no decoding, ZIP traversal, malware scan or Office subtype guarantee.
export function chatAttachmentHeaderMatches(type: string, bytes: Uint8Array, size: number) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (type.startsWith("image/") || type.startsWith("video/")) return eventMediaHeaderMatches(type, bytes, size);
  if (type === "audio/webm") return eventMediaHeaderMatches("video/webm", bytes, size);
  if (["audio/mp4", "audio/x-m4a"].includes(type)) return eventMediaHeaderMatches("video/mp4", bytes, size);
  if (type === "audio/wav") return size >= 44 && bytes.length >= 16 && ascii(0,4) === "RIFF" && ascii(8,12) === "WAVE"
    && new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true) + 8 === size;
  if (type === "audio/ogg") return size >= 27 && bytes.length >= 27 && ascii(0,4) === "OggS" && bytes[4] === 0;
  if (type === "audio/mpeg") return size >= 10 && bytes.length >= 10 && (ascii(0,3) === "ID3" && [2,3,4].includes(bytes[3])
    || bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 24) !== 8 && (bytes[1] & 6) !== 0 && (bytes[2] & 240) !== 0 && (bytes[2] & 240) !== 240 && (bytes[2] & 12) !== 12);
  if (type === "application/pdf") return size >= 8 && bytes.length >= 8 && /^%PDF-[12]\.[0-9]/.test(ascii(0,8));
  if (["application/msword", "application/vnd.ms-excel"].includes(type)) return size >= 512 && bytes.length >= 8 && [208,207,17,224,161,177,26,225].every((n,i)=>bytes[i]===n);
  if (type.includes("openxmlformats")) return size >= 30 && bytes.length >= 30 && [80,75,3,4].every((n,i)=>bytes[i]===n);
  return false;
}
export async function validateChatAttachment(file: File) {
  const metadata = chatAttachmentMetadata(file);
  if (!chatAttachmentHeaderMatches(metadata.type,new Uint8Array(await file.slice(0,4096).arrayBuffer()),metadata.size)) throw new ChatAttachmentError("CHAT_FILE_INVALID");
  return metadata;
}
export function chatAttachmentKey(key: unknown, family: string, channel: string) {
  if (!noticeUuid(family) || !noticeUuid(channel) || typeof key !== "string") return false;
  const prefix = `families/${family}/chat/${channel}/`;
  if (!key.startsWith(prefix)) return false;
  const parts = key.slice(prefix.length).split(".");
  return parts.length === 2 && noticeUuid(parts[0]) && Object.values(extensions).some(values=>values.includes(parts[1]));
}
export function chatAttachmentPublic(raw: unknown, own?: boolean) {
  if (!noticeObject(raw) || !noticeUuid(raw.id) || !noticeUuid(raw.channel_id) || !noticeUuid(raw.message_id) || typeof raw.created_at !== "string") return null;
  try { if(!noticeTimestamp(raw.created_at))return null; chatAttachmentMetadata({name:raw.file_name as string,type:raw.mime_type as string,size:raw.file_size as number}); } catch { return null; }
  if(Object.hasOwn(raw,"is_mine")&&typeof raw.is_mine!=="boolean")return null;
  return {id:raw.id,channel_id:raw.channel_id,message_id:raw.message_id,file_name:raw.file_name as string,mime_type:raw.mime_type as string,file_size:raw.file_size as number,created_at:raw.created_at,...(own!==undefined?{is_mine:own}:typeof raw.is_mine==="boolean"?{is_mine:raw.is_mine}:{})};
}
export function chatAttachmentAcknowledged(input: ReturnType<typeof chatAttachmentInput>, status: number, raw: unknown) {
  if (!noticeObject(raw) || raw.success !== true || raw.outcomeUnknown === true || ![201,202].includes(status)
    || ["auditPending","syncPending"].some(k=>Object.hasOwn(raw,k)&&typeof raw[k]!=="boolean")
    || (status===202)!==(raw.auditPending===true||raw.syncPending===true) || status===202&&raw.code!=="CHAT_FILE_PENDING") return false;
  const message=chatMessagePublic(raw.message), attachment=chatAttachmentPublic(raw.attachment);
  return !!message && !!attachment && attachment.is_mine===true && message.is_mine && message.message_type==="attachment" && message.channel_id===input.channelId
    && message.body===input.caption && message.reply_to_id===input.replyToId && message.edited_at===null && attachment.message_id===message.id
    && attachment.channel_id===input.channelId && attachment.file_name===input.metadata.name && attachment.mime_type===input.metadata.type && attachment.file_size===input.metadata.size;
}
export function chatAttachmentCopy(code: unknown, locale: "bn"|"en") {
  const bn=locale==="bn";
  if(code==="CHAT_FILE_INPUT")return bn?"Channel, reply ও সর্বোচ্চ ২০০০ অক্ষরের caption যাচাই করুন।":"Check channel, reply and caption (maximum 2,000 characters).";
  if(code==="CHAT_FILE_INVALID")return bn?"File-এর নাম, ধরন, extension ও content header মিলতে হবে। ছবি ৮, audio ১৫, video ২৫, document ১০ MiB পর্যন্ত।":"File name, type, extension and content header must match. Limits: image 8, audio 15, video 25, document 10 MiB.";
  if(code==="CHAT_FILE_PENDING")return bn?"সংযুক্তি সংরক্ষিত। Audit বা channel refresh বাকি; আবার upload করবেন না।":"Attachment saved. Audit or channel refresh is pending; do not upload again.";
  if(code==="CHAT_FILE_REJECTED"||code==="CHAT_FILE_STORAGE")return bn?"সংযুক্তি সংরক্ষণ হয়নি। File ও caption রাখা হয়েছে; storage বা input যাচাই করুন।":"Attachment was not saved. File and caption were retained; check storage or input.";
  return bn?"Upload-এর ফল নিশ্চিত নয়। File ও caption রাখা হয়েছে। Channel reload করে মিলিয়ে দেখুন; আবার পাঠানোর আগে প্রয়োজনে support নিন। Reload অসম্পূর্ণ record/file/audit ঠিক করে না।":"Upload outcome is uncertain. File and caption were retained. Reload the channel and review before resending; contact support if needed. Reload does not repair incomplete records, files or audits.";
}
export function chatAttachmentFeedback(path: string,status: number,raw: Record<string,unknown>,locale:"bn"|"en",body?:BodyInit|null) {
  if(path!=="/api/chat/upload")return null;
  if(status===413)return {kind:"error" as const,title:locale==="bn"?"File বেশি বড়":"File too large",message:chatAttachmentCopy("CHAT_FILE_INVALID",locale)};
  if(raw.code==="CHAT_FILE_STORAGE"||raw.code==="CHAT_FILE_REJECTED")return {kind:"error" as const,title:locale==="bn"?"Upload হয়নি":"Upload not saved",message:chatAttachmentCopy(raw.code,locale)};
  let acknowledged=false;try{if(body instanceof FormData)acknowledged=chatAttachmentAcknowledged(chatAttachmentInput(body),status,raw);}catch{/* Invalid request cannot be acknowledged. */}
  if(status>=500||status===408||raw.outcomeUnknown===true||status>=200&&status<300&&!acknowledged)return {kind:"info" as const,title:locale==="bn"?"Upload যাচাই প্রয়োজন":"Verify upload outcome",message:chatAttachmentCopy("CHAT_FILE_UNKNOWN",locale)};
  if(status===202)return {kind:"info" as const,title:locale==="bn"?"সংযুক্তি সংরক্ষিত; কাজ বাকি":"Attachment saved; work pending",message:chatAttachmentCopy("CHAT_FILE_PENDING",locale)};
  if(status>=400&&typeof raw.code==="string"&&raw.code.startsWith("CHAT_FILE_"))return {kind:"error" as const,title:locale==="bn"?"File যাচাই করুন":"Check attachment",message:chatAttachmentCopy(raw.code,locale)};
  return null;
}
export async function readChatAttachmentChange(request:()=>Promise<Response>,input:ReturnType<typeof chatAttachmentInput>) {
  try {
    const response=await request();if(response.status===499)return {kind:"cancelled" as const};
    const raw:unknown=await response.json().catch(()=>null),payload=noticeObject(raw)?raw:{};
    if(response.status===413)return {kind:"rejected" as const,code:"CHAT_FILE_INVALID"};
    if(payload.code==="CHAT_FILE_STORAGE"||payload.code==="CHAT_FILE_REJECTED")return {kind:"rejected" as const,code:payload.code};
    if(response.status>=500||response.status===408||payload.outcomeUnknown===true)return {kind:"unknown" as const};
    if(!response.ok)return {kind:"rejected" as const,code:typeof payload.code==="string"?payload.code:"CHAT_FILE_INPUT"};
    if(!chatAttachmentAcknowledged(input,response.status,raw))return {kind:"unknown" as const};
    return {kind:"confirmed" as const,message:chatMessagePublic(payload.message)!,attachment:chatAttachmentPublic(payload.attachment)!,pending:response.status===202};
  }catch{return {kind:"unknown" as const};}
}
export function chatAttachmentActionCopy(path:string,method:string,locale:"bn"|"en") {
  if(path!=="/api/chat/upload"||method!=="POST")return null;
  const bn=locale==="bn";
  return {title:bn?"Channel-এ file পাঠাবেন?":"Send this file to the channel?",description:bn?"অনুমোদিত channel participant-রা file ও caption দেখবেন। প্রাপক যাচাই করুন। Cancel/× কোনো upload পাঠায় না।":"Authorized channel participants can view the file and caption. Check recipients. Cancel/× sends no upload.",confirmLabel:bn?"হ্যাঁ, পাঠান":"Yes, send",destructive:false,successMessage:bn?"সংযুক্তি পাঠানো হয়েছে।":"Attachment sent."};
}
