import { noticeObject, noticeUuid, noticeTimestamp } from "./notice-validation.ts";
import { chatChannelPublic } from "./chat-setup-workflow.ts";
import { canAccessChatChannel, canManageChatRole } from "./chat-access-policy.ts";
import type { FamilyRole } from "./family-access";

export class ChatChannelError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code: string, status = 400): never => { throw new ChatChannelError(code, status); };
const stamp = (value: unknown): value is string => { try { return typeof value === "string" && !!noticeTimestamp(value); } catch { return false; } };
function text(value: unknown, min: number, max: number): string | null {
  if (value === null && min === 0) return null;
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return fail("CHAT_CHANNEL_INVALID");
  return value.trim() || null;
}
export function chatLifecycleInput(value: unknown) {
  if (!noticeObject(value) || Object.keys(value).some(k => !["action", "expectedFamilyId", "expectedChannelType", "expectedVisibility", "expectedName", "expectedDescription", "expectedStatus", "expectedUpdatedAt", "name", "description"].includes(k))) return fail("CHAT_CHANNEL_INVALID");
  if (!["edit", "archive", "restore"].includes(value.action as string) || !noticeUuid(value.expectedFamilyId) || !["active", "archived"].includes(value.expectedStatus as string) || !stamp(value.expectedUpdatedAt)) return fail("CHAT_CHANNEL_INVALID");
  const action = value.action as "edit" | "archive" | "restore";
  if (!["custom", "admin"].includes(value.expectedChannelType as string) || !["family", "admins", "invite_only"].includes(value.expectedVisibility as string)
    || value.expectedChannelType === "admin" && value.expectedVisibility !== "admins" || value.expectedChannelType === "custom" && value.expectedVisibility === "admins") return fail("CHAT_CHANNEL_INVALID");
  const expectedName = text(value.expectedName, 2, 100)!;
  const expectedDescription = text(value.expectedDescription, 0, 500);
  if (expectedName !== value.expectedName || expectedDescription !== value.expectedDescription) return fail("CHAT_CHANNEL_INVALID");
  if ((action === "archive" && value.expectedStatus !== "active") || (action === "restore" && value.expectedStatus !== "archived") || (action === "edit" && value.expectedStatus !== "active")) return fail("CHAT_CHANNEL_INVALID");
  if (action !== "edit" && (Object.hasOwn(value, "name") || Object.hasOwn(value, "description"))) return fail("CHAT_CHANNEL_INVALID");
  return { action, expectedFamilyId: value.expectedFamilyId.toLowerCase(), expectedChannelType: value.expectedChannelType as "custom" | "admin", expectedVisibility: value.expectedVisibility as "family" | "admins" | "invite_only", expectedName, expectedDescription, expectedStatus: value.expectedStatus as "active" | "archived", expectedUpdatedAt: value.expectedUpdatedAt,
    name: action === "edit" ? text(value.name, 2, 100)! : expectedName,
    description: action === "edit" ? text(value.description, 0, 500) : expectedDescription,
    status: action === "archive" ? "archived" as const : "active" as const };
}
export type ChatLifecycleInput = ReturnType<typeof chatLifecycleInput>;
export function managedChannelPublic(raw: unknown) {
  const c = chatChannelPublic(raw);
  if (!c || !["custom", "admin"].includes(c.channel_type) || c.name.length < 2) return fail("CHAT_CHANNEL_LOAD", 503);
  return { id: c.id, name: c.name, description: c.description, channelType: c.channel_type, visibility: c.visibility, status: c.status, createdAt: c.created_at, updatedAt: c.updated_at };
}
export type ManagedChatChannel = ReturnType<typeof managedChannelPublic>;
// Managers cannot use this endpoint as a private-channel bypass. Invitations
// remain mandatory; private moderation also requires owner/moderator status.
export function chatLifecycleAllowed(row: unknown, familyRole: FamilyRole, own: { role: string; status: string } | null) {
  if (!noticeObject(row) || !["custom", "admin"].includes(row.channel_type as string) || !["family", "admins", "invite_only"].includes(row.visibility as string) || !canManageChatRole(familyRole)) return false;
  if (row.channel_type === "admin" && row.visibility !== "admins" || row.channel_type === "custom" && row.visibility === "admins") return false;
  if (!canAccessChatChannel(row.visibility as "family" | "admins" | "invite_only", familyRole, own?.status === "active")) return false;
  return row.visibility !== "invite_only" || (own?.status === "active" && ["owner", "moderator"].includes(own.role));
}
export async function chatLifecycleWrite(o: { row: Record<string, unknown>; input: ChatLifecycleInput; write: (updatedAt: string) => Promise<unknown>; audit: () => Promise<unknown>; rejected: (e: unknown) => boolean; now?: number }) {
  const { row, input } = o;
  let before: ManagedChatChannel;
  try { before = managedChannelPublic(row); } catch { return fail("CHAT_CHANNEL_UNKNOWN", 503); }
  if (row.family_id !== input.expectedFamilyId || before.channelType !== input.expectedChannelType || before.visibility !== input.expectedVisibility || before.name !== input.expectedName || before.description !== input.expectedDescription || before.status !== input.expectedStatus || before.updatedAt !== input.expectedUpdatedAt) return fail("CHAT_CHANNEL_CHANGED", 409);
  if (before.name === input.name && before.description === input.description && before.status === input.status) return { success: true, action: input.action, channel: before, noChange: true, auditPending: false };
  const updatedAt = new Date(Math.max(o.now ?? Date.now(), Date.parse(before.updatedAt) + 1)).toISOString();
  let rows: unknown;
  try { rows = await o.write(updatedAt); } catch (e) { return fail(o.rejected(e) ? "CHAT_CHANNEL_REJECTED" : "CHAT_CHANNEL_UNKNOWN", o.rejected(e) ? 400 : 503); }
  if (Array.isArray(rows) && rows.length === 0) return fail("CHAT_CHANNEL_CHANGED", 409);
  if (!Array.isArray(rows) || rows.length !== 1 || !noticeObject(rows[0])) return fail("CHAT_CHANNEL_UNKNOWN", 503);
  const saved = rows[0];
  for (const k of ["id", "family_id", "channel_type", "visibility", "direct_key", "created_by_user_id", "created_at"]) if (saved[k] !== row[k]) return fail("CHAT_CHANNEL_UNKNOWN", 503);
  if (saved.name !== input.name || saved.description !== input.description || saved.status !== input.status || Date.parse(saved.updated_at as string) !== Date.parse(updatedAt)) return fail("CHAT_CHANNEL_UNKNOWN", 503);
  let channel: ManagedChatChannel;
  try { channel = managedChannelPublic(saved); } catch { return fail("CHAT_CHANNEL_UNKNOWN", 503); }
  let auditPending = false;
  try { await o.audit(); } catch { auditPending = true; }
  return { success: true, action: input.action, channel, noChange: false, auditPending };
}
export function chatLifecycleAcknowledged(id: string, input: ChatLifecycleInput, status: number, value: unknown) {
  if (![200, 202].includes(status) || !noticeObject(value) || value.success !== true || value.action !== input.action || typeof value.noChange !== "boolean" || value.auditPending !== (status === 202) || !noticeObject(value.channel)) return false;
  const c = value.channel;
  return c.id === id && c.name === input.name && c.description === input.description && c.status === input.status && c.channelType === input.expectedChannelType && c.visibility === input.expectedVisibility && !["family_id", "created_by_user_id", "direct_key"].some(k => Object.hasOwn(c, k))
    && stamp(c.createdAt) && stamp(c.updatedAt) && (value.noChange ? input.action === "edit" && input.name === input.expectedName && input.description === input.expectedDescription && input.status === input.expectedStatus && c.updatedAt === input.expectedUpdatedAt && !value.auditPending : Date.parse(c.updatedAt) > Date.parse(input.expectedUpdatedAt));
}
export function chatLifecycleSnapshot(value: unknown): { familyId: string; actorId: string; channels: (ManagedChatChannel & { canManageMembers?: boolean })[] } | null {
  if (!noticeObject(value) || !noticeUuid(value.familyId) || typeof value.actorId !== "string" || !value.actorId || !Array.isArray(value.channels) || value.channels.length > 20000) return null;
  const ids = new Set<string>();
  for (const c of value.channels) {
    if (!noticeObject(c) || !noticeUuid(c.id) || ids.has(c.id) || typeof c.name !== "string" || c.name.length < 2 || c.name.length > 100 || !(c.description === null || typeof c.description === "string" && c.description.length <= 500)
      || !["custom", "admin"].includes(c.channelType as string) || !["family", "admins", "invite_only"].includes(c.visibility as string) || !["active", "archived"].includes(c.status as string) || !stamp(c.updatedAt) || !stamp(c.createdAt)
      || c.canManageMembers !== undefined && typeof c.canManageMembers !== "boolean" || ["family_id", "created_by_user_id", "direct_key"].some(k => Object.hasOwn(c, k))) return null;
    ids.add(c.id);
  }
  return value as { familyId: string; actorId: string; channels: (ManagedChatChannel & { canManageMembers?: boolean })[] };
}
export function chatLifecycleCopy(code: unknown, locale: "bn" | "en") {
  const messages: Record<string, [string, string]> = {
    CHAT_CHANNEL_INVALID: ["সঠিক channel, নাম (২–১০০), বিবরণ (সর্বোচ্চ ৫০০) ও বর্তমান version দিন।", "Provide valid channel details: name 2–100, description up to 500 and the current version."],
    CHAT_CHANNEL_FORBIDDEN: ["এই channel পরিচালনার অনুমতি নেই। Private channel-এর অনুমোদনও প্রয়োজন।", "You cannot manage this channel. Private-channel authorization is also required."],
    CHAT_CHANNEL_NOT_FOUND: ["অনুমোদিত channel পাওয়া যায়নি।", "An authorized channel was not found."],
    CHAT_CHANNEL_CHANGED: ["Channel বা পরিবার বদলেছে। বর্তমান তালিকা লোড করে পুনরায় যাচাই করুন।", "The channel or family changed. Load the current list and review it again."],
    CHAT_CHANNEL_REJECTED: ["Database পরিবর্তন গ্রহণ করেনি। তথ্য ও অনুমতি যাচাই করুন।", "The database rejected the change. Check the details and permissions."],
    CHAT_CHANNEL_UNKNOWN: ["পরিবর্তন সংরক্ষিত হয়েছে কি না নিশ্চিত নয়। আবার পাঠাবেন না; বর্তমান অবস্থা লোড করে যাচাই করুন।", "The change may already be saved. Do not resubmit; load the current state to verify."],
    CHAT_CHANNEL_AUDIT_PENDING: ["Channel সংরক্ষিত, audit pending। একই কাজ আবার পাঠাবেন না; Support-এর সহায়তা নিন।", "The channel is saved, but its audit is pending. Do not repeat the change; contact support."],
    CHAT_CHANNEL_LOAD: ["সম্পূর্ণ অনুমোদিত তালিকা পাওয়া যায়নি। পুরোনো তথ্য সরানো হয়েছে; আবার লোড করুন।", "A complete authorized list could not be loaded. Previous data was cleared; reload."],
  };
  return (messages[typeof code === "string" ? code : ""] ?? messages.CHAT_CHANNEL_UNKNOWN)[locale === "bn" ? 0 : 1];
}
export function chatLifecycleActionCopy(path: string, method: string, body: Record<string, unknown>, locale: "bn" | "en") {
  if (!/^\/api\/chat-channels\/[^/]+$/.test(path) || method !== "PATCH") return null;
  const pick = (bn: string, en: string) => locale === "bn" ? bn : en;
  return { title: pick("Channel পরিবর্তন নিশ্চিত করুন", "Confirm channel change"), confirmLabel: pick("হ্যাঁ, সংরক্ষণ করুন", "Yes, save"), destructive: body.action === "archive",
    description: body.action === "archive" ? pick("Channel archive হবে; chat, send ও file access বন্ধ থাকবে। History/file মুছবে না; restore করা যাবে।", "Archive this channel: chat, sending and file access will stop. History/files remain and can be restored.") : body.action === "restore" ? pick("আগের audience ও member অনুমতি রেখে channel আবার চালু হবে।", "Reopen the channel with its existing audience and member permissions.") : pick("শুধু নাম ও বিবরণ বদলাবে; audience, member ও history অপরিবর্তিত থাকবে।", "Only name and description change; audience, members and history remain unchanged."),
    successMessage: pick("Channel সংরক্ষিত হয়েছে।", "Channel saved.") };
}
export function chatLifecycleFeedback(path: string, status: number, value: unknown, locale: "bn" | "en", method: string, body: Record<string, unknown>) {
  if (!/^\/api\/chat-channels\/[^/]+$/.test(path) || method !== "PATCH") return null;
  let confirmed = false;
  try { confirmed = chatLifecycleAcknowledged(path.split("/").at(-1)!, chatLifecycleInput(body), status, value); } catch { /* Invalid acknowledgement is never success. */ }
  const p = noticeObject(value) ? value : {};
  const unknown = !confirmed && (status < 400 || status >= 500 || status === 408 || p.outcomeUnknown === true);
  const pending = confirmed && status === 202;
  const kind = confirmed && !pending && !p.noChange ? "success" as const : unknown || pending || p.noChange === true ? "info" as const : "error" as const;
  return { kind, title: locale === "bn" ? (kind === "success" ? "সংরক্ষিত" : kind === "error" ? "Error" : "যাচাই প্রয়োজন") : kind === "success" ? "Saved" : kind === "error" ? "Error" : "Review needed",
    message: confirmed ? (pending ? chatLifecycleCopy("CHAT_CHANNEL_AUDIT_PENDING", locale) : locale === "bn" ? (p.noChange ? "পরিবর্তন প্রয়োজন নেই।" : "Channel সংরক্ষিত; history/file অপরিবর্তিত।") : p.noChange ? "No change needed." : "Channel saved; history/files unchanged.") : chatLifecycleCopy(unknown ? "CHAT_CHANNEL_UNKNOWN" : p.code, locale) };
}
