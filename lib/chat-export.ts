import { noticeObject, noticeTimestamp, noticeUuid } from "./notice-validation.ts";
import { chatScopedFeed, type ChatScope } from "./chat-read.ts";
import { chatChannelPublic } from "./chat-setup-workflow.ts";
import { chatMembershipSnapshot } from "./chat-membership-workflow.ts";
type Locale = "bn" | "en";
const invalid = (): never => { throw new Error("CHAT_READ_INVALID"); };
const index = (locale: Locale) => locale === "bn" ? 0 : locale === "en" ? 1 : invalid();
export function chatExportSnapshot(raw: unknown, channelId: string, scope: ChatScope) {
  if (!noticeObject(raw) || !noticeUuid(scope.familyId) || !scope.actorId) return null;
  const channel = chatChannelPublic(raw.channel), feed = chatScopedFeed(raw, channelId, scope, 20000);
  if (!channel || channel.id !== channelId || channel.status !== "active" || !feed || !Array.isArray(raw.participants) || raw.participants.length > 20000
    || raw.participants.some(p => !noticeObject(p) || typeof p.name !== "string" || !p.name || p.name.length > 180 || !["owner", "family_admin", "manager", "member"].includes(p.role as string))) return null;
  const ids = new Set(feed.messages.map(m => m.id));
  if (feed.messages.some(m => m.reply_to_id && !ids.has(m.reply_to_id))) return null;
  return { channel, ...feed, participants: raw.participants as Array<{ name: string; role: string }> };
}
type Column = readonly [string, string];
// UTC serials remain sortable numeric Excel date cells in either locale.
// User content stays literal; no formulas, hyperlinks or raw account/storage IDs.
function worksheet(xlsx: typeof import("xlsx"), headers: readonly Column[], rows: unknown[][], dateCols: number[], locale: Locale) {
  const n = index(locale), dates = new Set(dateCols);
  const serial = (v: unknown) => {
    if (v === null) return "";
    let value: string | null; try { value = noticeTimestamp(v); } catch { return invalid(); }
    if (!value) return invalid();
    const d = new Date(value); if (d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 9999) return invalid();
    let number = (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000; if (number < 61) number--;
    if (!Number.isFinite(number) || number < 1 || number >= 2958466) return invalid(); return number;
  };
  const matrix = rows.map(row => headers.map((_, c) => {
    const v = row[c]; if (dates.has(c)) return serial(v);
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
    if (typeof v !== "string" || v.length > 32767) return invalid(); return v;
  }));
  const sheet = xlsx.utils.aoa_to_sheet([[...headers.map(h => h[n]), n === 0 ? "সময় অঞ্চল" : "Time zone"], ...matrix.map(row => [...row, "UTC"])]);
  for (let r = 1; r <= rows.length; r++) for (let c = 0; c < headers.length; c++) {
    const cell = sheet[xlsx.utils.encode_cell({ r, c })]; if (!cell) continue;
    if (dates.has(c) && cell.t === "n") cell.z = "yyyy-mm-dd hh:mm:ss";
    if (typeof cell.v === "string") { cell.t = "s"; delete cell.f; delete cell.F; delete cell.l; }
  }
  sheet["!cols"] = [...headers.map((_, i) => ({ wch: dates.has(i) ? 24 : 32 })), { wch: 14 }];
  sheet["!autofilter"] = { ref: sheet["!ref"]! }; return sheet;
}
const roles: Record<string, readonly [string, string]> = { owner: ["মালিক", "Owner"], family_admin: ["পরিবার অ্যাডমিন", "Family admin"], manager: ["ব্যবস্থাপক", "Manager"], member: ["সদস্য", "Member"], moderator: ["মডারেটর", "Moderator"] };
export function chatHistoryWorkbook(xlsx: typeof import("xlsx"), raw: unknown, channelId: string, scope: ChatScope, locale: Locale) {
  const s = chatExportSnapshot(raw, channelId, scope); if (!s) return invalid();
  const n = index(locale), book = xlsx.utils.book_new();
  const append = (names: readonly [string, string], columns: readonly Column[], rows: unknown[][], dates: number[] = []) => xlsx.utils.book_append_sheet(book, worksheet(xlsx, columns, rows, dates, locale), names[n]);
  append(["বার্তা", "Messages"], [["Message ID", "Message ID"], ["প্রেরক", "Sender"], ["ধরন", "Type"], ["বার্তা", "Message"], ["Reply ID", "Reply ID"], ["তৈরির সময়", "Created at"], ["Edit সময়", "Edited at"]], s.messages.map(m => [m.id, m.author_name, m.message_type, m.body ?? "", m.reply_to_id ?? "", m.created_at, m.edited_at]), [5, 6]);
  append(["সদস্য", "Members"], [["ক্রমিক", "SL"], ["সদস্য", "Member"], ["Family role", "Family role"]], s.participants.map((m, i) => [i + 1, m.name, roles[m.role][n]]));
  append(["প্রতিক্রিয়া", "Reactions"], [["Reaction ID", "Reaction ID"], ["Message ID", "Message ID"], ["প্রতিক্রিয়া", "Reaction"], ["তৈরির সময়", "Created at"]], s.reactions.map(r => [r.id, r.message_id, r.emoji, r.created_at]), [3]);
  append(["সংযুক্তি", "Attachments"], [["File ID", "File ID"], ["Message ID", "Message ID"], ["ফাইলের নাম", "File name"], ["MIME type", "MIME type"], ["আকার (বাইট)", "Size (bytes)"], ["তৈরির সময়", "Created at"]], s.attachments.map(f => [f.id, f.message_id, f.file_name, f.mime_type, f.file_size, f.created_at]), [5]);
  append(["প্রসঙ্গ", "Context"], [["Channel ID", "Channel ID"], ["চ্যানেল", "Channel"], ["বিবরণ", "Description"], ["Audience", "Audience"], ["Channel type", "Channel type"], ["হালনাগাদের সময়", "Updated at"]], [[s.channel.id, s.channel.name, s.channel.description ?? "", s.channel.visibility, s.channel.channel_type, s.channel.updated_at]], [5]);
  return book;
}
export function chatMembershipWorkbook(xlsx: typeof import("xlsx"), raw: unknown, channelId: string, scope: ChatScope, locale: Locale) {
  const s = chatMembershipSnapshot(raw); if (!s || s.channel.id !== channelId || s.familyId !== scope.familyId || s.actorId !== scope.actorId) return invalid();
  const n = index(locale), book = xlsx.utils.book_new(), names = new Map(s.eligible.map(m => [m.userId, m.name]));
  const rows = s.members.map(m => [m.id, m.userId === s.actorId ? (n === 0 ? "Group owner (আপনি)" : "Group owner (you)") : names.get(m.userId) ?? (n === 0 ? "অনুপলব্ধ account" : "Unavailable account"), roles[m.role][n], m.status === "active" ? (n === 0 ? "চালু" : "Active") : (n === 0 ? "Access বন্ধ" : "Access removed"), m.notificationLevel, m.createdAt, m.updatedAt]);
  xlsx.utils.book_append_sheet(book, worksheet(xlsx, [["Membership ID", "Membership ID"], ["সদস্য", "Member"], ["Group role", "Group role"], ["অবস্থা", "Status"], ["Notification preference", "Notification preference"], ["তৈরির সময়", "Created at"], ["হালনাগাদের সময়", "Updated at"]], rows, [5, 6], locale), n === 0 ? "সদস্যপদ" : "Memberships");
  xlsx.utils.book_append_sheet(book, worksheet(xlsx, [["Channel ID", "Channel ID"], ["চ্যানেল", "Channel"], ["হালনাগাদের সময়", "Updated at"]], [[s.channel.id, s.channel.name, s.channel.updatedAt]], [2], locale), n === 0 ? "প্রসঙ্গ" : "Context");
  return book;
}
