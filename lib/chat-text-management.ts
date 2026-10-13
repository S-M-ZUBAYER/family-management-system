import { noticeObject, noticeUuid, noticeTimestamp } from "./notice-validation.ts";
export class ChatTextError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code=code; this.status=status; }
}
const stamp = (v: unknown) => { try { return typeof v === "string" && !!noticeTimestamp(v); } catch { return false; } };
export type ChatPublicMessage = { id: string; channel_id: string; author_name: string; message_type: "text" | "attachment" | "system"; body: string | null; reply_to_id: string | null; edited_at: string | null; created_at: string; is_mine: boolean };
export function chatMessagePublic(raw: unknown, own?: boolean): ChatPublicMessage | null {
  if (!noticeObject(raw) || !noticeUuid(raw.id) || !noticeUuid(raw.channel_id) || typeof raw.author_name !== "string" || !raw.author_name.trim() || raw.author_name.length > 180
    || !["text", "attachment", "system"].includes(raw.message_type as string) || !(raw.body === null || typeof raw.body === "string" && raw.body.length <= 5000)
    || (raw.message_type !== "attachment" && (typeof raw.body !== "string" || !raw.body.trim())) || !(raw.reply_to_id === null || noticeUuid(raw.reply_to_id))
    || !(raw.edited_at === null || stamp(raw.edited_at)) || !stamp(raw.created_at) || (own === undefined && typeof raw.is_mine !== "boolean")) return null;
  return { id: raw.id, channel_id: raw.channel_id, author_name: raw.author_name, message_type: raw.message_type as ChatPublicMessage["message_type"], body: raw.body as string | null,
    reply_to_id: raw.reply_to_id as string | null, edited_at: raw.edited_at as string | null, created_at: raw.created_at as string, is_mine: own ?? raw.is_mine as boolean };
}
export function chatTextRecord(method: "PATCH" | "DELETE", raw: unknown) {
  if (!["PATCH","DELETE"].includes(method)) throw new ChatTextError("CHAT_TEXT_INVALID_INPUT");
  if (!noticeObject(raw) || Object.keys(raw).some(k => !["expectedBody", "expectedEditedAt", ...(method === "PATCH" ? ["body"] : [])].includes(k))) throw new ChatTextError("CHAT_TEXT_INVALID_INPUT");
  if (typeof raw.expectedBody !== "string" || !raw.expectedBody.trim() || raw.expectedBody.length > 5000 || !(raw.expectedEditedAt === null || stamp(raw.expectedEditedAt))) throw new ChatTextError("CHAT_TEXT_INVALID_VERSION");
  if (method === "PATCH" && (typeof raw.body !== "string" || !raw.body.trim() || raw.body.length > 5000)) throw new ChatTextError("CHAT_TEXT_INVALID_BODY");
  return { expectedBody: raw.expectedBody, expectedEditedAt: raw.expectedEditedAt as string | null, ...(method === "PATCH" ? { body: (raw.body as string).trim() } : {}) };
}
export function chatTextMayChange(raw: unknown, actor: string) {
  return noticeObject(raw) && raw.message_type === "text" && typeof raw.auth_user_id === "string" && !!actor && raw.auth_user_id === actor && !!chatMessagePublic(raw, true);
}
export function chatFeedSnapshot(raw: unknown, channelId: string, maxMessages = 150) {
  if (![150,200].includes(maxMessages) || !noticeUuid(channelId) || !noticeObject(raw) || !noticeObject(raw.channel) || raw.channel.id !== channelId || !Array.isArray(raw.messages) || raw.messages.length > maxMessages
    || !Array.isArray(raw.reactions) || raw.reactions.length > 20000 || !Array.isArray(raw.attachments) || raw.attachments.length > 20000) return null;
  const messages: ChatPublicMessage[] = [], ids = new Set<string>();
  for (const value of raw.messages) { const row = chatMessagePublic(value); if (!row || row.channel_id !== channelId || ids.has(row.id)) return null; ids.add(row.id); messages.push(row); }
  const reactions: Array<{ id: string; message_id: string; emoji: string; created_at: string; is_mine: boolean }> = [], seenReactions = new Set<string>();
  for (const r of raw.reactions) {
    if (!noticeObject(r) || !noticeUuid(r.id) || seenReactions.has(r.id) || typeof r.message_id !== "string" || !ids.has(r.message_id) || !["❤️","👍","😂","🤲","🎉"].includes(r.emoji as string) || !stamp(r.created_at) || typeof r.is_mine !== "boolean") return null;
    seenReactions.add(r.id); reactions.push({id:r.id,message_id:r.message_id,emoji:r.emoji as string,created_at:r.created_at as string,is_mine:r.is_mine});
  }
  const attachments: Array<{id:string;channel_id:string;message_id:string;file_name:string;mime_type:string;file_size:number;created_at:string}> = [], seenFiles = new Set<string>();
  for (const r of raw.attachments) {
    if (!noticeObject(r) || !noticeUuid(r.id) || seenFiles.has(r.id) || r.channel_id !== channelId || typeof r.message_id !== "string" || !ids.has(r.message_id) || typeof r.file_name !== "string" || !r.file_name || r.file_name.length>500 || typeof r.mime_type!=="string" || !r.mime_type || typeof r.file_size!=="number" || !Number.isSafeInteger(r.file_size) || r.file_size<1 || !stamp(r.created_at)) return null;
    seenFiles.add(r.id); attachments.push({id:r.id,channel_id:channelId,message_id:r.message_id,file_name:r.file_name,mime_type:r.mime_type,file_size:r.file_size,created_at:r.created_at as string});
  }
  return {messages,reactions,attachments};
}
export function reconcileChatMessages(current: ChatPublicMessage[], incoming: ChatPublicMessage[], removed: Set<string>, replace = false) {
  if (replace) { const present=new Set(incoming.map(r=>r.id)); for(const r of current)if(!present.has(r.id))removed.add(r.id); }
  const map = new Map((replace?[]:current).map(r=>[r.id,r]));
  for(const r of incoming)if(replace || !removed.has(r.id)) { const old=map.get(r.id); if(!old || Date.parse(r.edited_at??r.created_at)>=Date.parse(old.edited_at??old.created_at))map.set(r.id,r); }
  return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
export function chatNextEditedAt(row: { created_at: string; edited_at: string | null }, now = Date.now()) {
  const ms = Math.max(now, Date.parse(row.edited_at ?? row.created_at) + 1), value = new Date(ms).toISOString();
  if (!/^\d{4}-/.test(value) || !stamp(value)) throw new ChatTextError("CHAT_TEXT_INVALID_VERSION");
  return value;
}
export async function chatTextWrite(o: { method: "PATCH" | "DELETE"; row: Record<string, unknown>; body?: string; editedAt?: string;
  write: () => Promise<unknown>; audit: () => Promise<unknown>; rejected: (e: unknown) => boolean }) {
  let saved: Record<string, unknown>;
  try {
    const rows = await o.write();
    if (Array.isArray(rows) && !rows.length) throw new ChatTextError("CHAT_TEXT_CHANGED", 409);
    if (!Array.isArray(rows) || rows.length !== 1 || !noticeObject(rows[0])) throw new ChatTextError("CHAT_TEXT_UNKNOWN", 503);
    saved = rows[0];
    for (const key of ["id", "family_id", "channel_id", "auth_user_id", "author_name", "message_type", "created_at", "reply_to_id"]) if (saved[key] !== o.row[key]) throw new ChatTextError("CHAT_TEXT_UNKNOWN", 503);
    if (!chatMessagePublic(saved, true) || saved.body !== (o.method === "PATCH" ? o.body : o.row.body)
      || (o.method === "PATCH" ? Date.parse(saved.edited_at as string) !== Date.parse(o.editedAt!) : saved.edited_at !== o.row.edited_at)) throw new ChatTextError("CHAT_TEXT_UNKNOWN", 503);
  } catch (error) {
    if (error instanceof ChatTextError) throw error;
    throw new ChatTextError(o.rejected(error) ? "CHAT_TEXT_REJECTED" : "CHAT_TEXT_UNKNOWN", o.rejected(error) ? 400 : 503);
  }
  let auditPending = false; try { await o.audit(); } catch { auditPending = true; console.error("Chat text change confirmed; audit pending."); }
  return { id: saved.id as string, channelId: saved.channel_id as string, message: o.method === "PATCH" ? chatMessagePublic(saved, true) : null, auditPending };
}
export function chatTextResponse(r: Awaited<ReturnType<typeof chatTextWrite>>) {
  return Response.json({ success: true, id: r.id, channelId: r.channelId, ...(r.message ? { message: r.message } : { deleted: true }), ...(r.auditPending ? { code: "CHAT_TEXT_PENDING", auditPending: true } : {}) }, { status: r.auditPending ? 202 : 200 });
}
export function chatTextAcknowledged(method: "PATCH" | "DELETE", id: string, channel: string, body: Record<string, unknown>, status: number, raw: unknown) {
  if (!noticeUuid(id) || !noticeUuid(channel)) return false;
  if (!noticeObject(raw) || raw.success !== true || raw.id !== id || raw.channelId !== channel || raw.outcomeUnknown === true || ![200,202].includes(status)
    || (Object.hasOwn(raw, "auditPending") && typeof raw.auditPending !== "boolean") || (status === 202) !== (raw.auditPending === true) || (status === 202 && raw.code !== "CHAT_TEXT_PENDING")) return false;
  try { const record = chatTextRecord(method, body);
    if (method === "DELETE") return raw.deleted === true && !Object.hasOwn(raw, "message");
    const row = chatMessagePublic(raw.message);
    return !!row && row.id === id && row.channel_id === channel && row.is_mine && row.message_type === "text" && row.body === record.body && row.edited_at !== null
      && Date.parse(row.edited_at) > Date.parse(record.expectedEditedAt ?? "0001-01-01T00:00:00Z");
  } catch { return false; }
}
export async function readChatTextChange(request: () => Promise<Response>, method: "PATCH" | "DELETE", id: string, channel: string, body: Record<string, unknown>) {
  try { const r = await request(); if (r.status === 499) return { kind: "cancelled" as const };
    const raw: unknown = await r.json().catch(() => null), payload = noticeObject(raw) ? raw : {};
    if (r.status >= 500 || r.status === 408 || payload.outcomeUnknown === true) return { kind: "unknown" as const };
    if (!r.ok) return { kind: "rejected" as const, payload };
    if (!chatTextAcknowledged(method,id,channel,body,r.status,raw)) return { kind: "unknown" as const };
    return { kind: "confirmed" as const, message: method === "PATCH" ? chatMessagePublic(payload.message) : null, pending: payload.auditPending === true };
  } catch { return { kind: "unknown" as const }; }
}
export function chatTextCopy(code: unknown, locale: "bn" | "en") {
  const copy: Record<string,[string,string]> = {
    CHAT_TEXT_INVALID_INPUT: ["Message-এর তথ্য সঠিক নয়।", "Invalid message input."], CHAT_TEXT_INVALID_BODY: ["১–৫০০০ অক্ষরের লেখা দিন; লেখা কেটে save হবে না।", "Enter 1–5000 characters; text will not be truncated."],
    CHAT_TEXT_INVALID_VERSION: ["আগের লেখা ও edit-version প্রয়োজন। বর্তমান channel reload করুন।", "Original text and edit version are required. Reload the current channel."],
    CHAT_TEXT_CHANGED: ["Message বদলেছে বা মুছে গেছে। Channel reload করে বর্তমান লেখা দেখুন।", "The message changed or was deleted. Reload the channel to review it."],
    CHAT_TEXT_FORBIDDEN: ["শুধু নিজের text message edit/delete করতে পারবেন; অন্যের লেখা, system বা attachment নয়।", "Only your own text message can be edited/deleted, not another author's text, system or attachment messages."],
    CHAT_TEXT_HAS_FILES: ["এই message-এর file আছে। File-safe deletion প্রস্তুত না হওয়া পর্যন্ত এটি মুছবেন না।", "This message has files. Deletion is blocked until file-safe deletion is available."],
    CHAT_TEXT_NOT_FOUND: ["অনুমোদিত channel-এ message পাওয়া যায়নি।", "Message not found in an accessible channel."],
    CHAT_TEXT_REJECTED: ["পরিবর্তন গ্রহণ করা হয়নি। Draft রেখে বর্তমান channel যাচাই করুন।", "The change was rejected. Keep the draft and review the channel."],
    CHAT_TEXT_PENDING: ["পরিবর্তন নিশ্চিত হয়েছে; audit বাকি। একই কাজ আবার পাঠাবেন না।", "Change confirmed; audit pending. Do not resubmit it."],
    CHAT_TEXT_UNKNOWN: ["ফল নিশ্চিত নয়। আবার পাঠাবেন না; Reload to verify দিয়ে message-এর অবস্থা মিলিয়ে নিন।", "Outcome uncertain. Do not resubmit; use Reload to verify the message state."],
  }; return typeof code === "string" && Object.hasOwn(copy,code) ? copy[code][locale === "bn" ? 0 : 1] : null;
}
export function chatTextActionCopy(path: string, method: string, locale: "bn" | "en") {
  if (!/^\/api\/chat-messages\/[^/]+$/.test(path) || !["PATCH","DELETE"].includes(method)) return null;
  const remove = method === "DELETE", bn = locale === "bn";
  return { title: remove ? bn ? "নিজের message স্থায়ীভাবে মুছবেন?" : "Permanently delete your message?" : bn ? "নিজের message আপডেট করবেন?" : "Update your message?",
    description: remove ? bn ? "সব channel participant-এর history থেকে এটি সরবে; reaction সরে যাবে, replies-এর reference খুলবে। Undo নেই; file message মুছবে না।" : "It leaves every participant's history. Reactions are removed and reply references cleared. No undo; file messages are not deleted." : bn ? "নতুন লেখা দেখাবে; মূল লেখক ও পাঠানোর সময় বদলাবে না।" : "New text will appear; author and original send time remain unchanged.",
    confirmLabel: bn ? "হ্যাঁ, নিশ্চিত করুন" : "Yes, confirm", destructive: remove, successMessage: remove ? bn ? "Message মুছে ফেলা হয়েছে।" : "Message deleted." : bn ? "Message আপডেট হয়েছে।" : "Message updated." };
}
export function chatTextFeedback(path: string, status: number, raw: Record<string,unknown>, locale: "bn" | "en", method = "", body: Record<string,unknown> = {}) {
  const m = /^\/api\/chat-messages\/([^/]+)$/.exec(path); if (!m) return null;
  const unknown = status >= 500 || status === 408 || raw.outcomeUnknown === true || (status >= 200 && status < 300 && (!["PATCH","DELETE"].includes(method) || typeof raw.channelId !== "string" || !chatTextAcknowledged(method as "PATCH"|"DELETE",m[1],raw.channelId,body,status,raw)));
  if (unknown || status === 202) return { kind: "info" as const, title: locale === "bn" ? "Message-এর অবস্থা যাচাই করুন" : "Review message state", message: chatTextCopy(unknown ? "CHAT_TEXT_UNKNOWN" : "CHAT_TEXT_PENDING",locale)! };
  if (status >= 400) return { kind: "error" as const, title: locale === "bn" ? "Message বদলানো হয়নি" : "Message was not changed", message: chatTextCopy(raw.code,locale) ?? chatTextCopy("CHAT_TEXT_REJECTED",locale)! };
  return null;
}
