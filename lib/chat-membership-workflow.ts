import { noticeObject, noticeUuid, noticeTimestamp } from "./notice-validation.ts";
import { canManageChatRole } from "./chat-access-policy.ts";
import type { FamilyRole } from "./family-access";

export class ChatMembershipError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code: string, status = 400): never => { throw new ChatMembershipError(code, status); };
const account = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 240 && !/[\u0000-\u001f\u007f]/.test(v);
const stamp = (v: unknown): v is string => { try { return typeof v === "string" && !!noticeTimestamp(v); } catch { return false; } };
const roles = ["owner", "moderator", "member"], states = ["active", "left"], levels = ["all", "mentions", "muted"];
export function chatMembershipInput(raw: unknown) {
  const keys = ["action", "targetUserId", "expectedFamilyId", "expectedActorId", "expectedChannelUpdatedAt", "expectedMembershipId", "expectedRole", "expectedStatus", "expectedUpdatedAt", "clientMembershipId"];
  if (!noticeObject(raw) || Object.keys(raw).some(k => !keys.includes(k)) || !["invite", "remove", "promote", "demote"].includes(raw.action as string)
    || !account(raw.targetUserId) || !account(raw.expectedActorId) || !noticeUuid(raw.expectedFamilyId) || !stamp(raw.expectedChannelUpdatedAt)) return fail("CHAT_MEMBER_INVALID");
  const absent = raw.expectedMembershipId === null;
  if (absent ? raw.action !== "invite" || raw.expectedRole !== null || raw.expectedStatus !== null || raw.expectedUpdatedAt !== null || !noticeUuid(raw.clientMembershipId)
    : !noticeUuid(raw.expectedMembershipId) || !roles.includes(raw.expectedRole as string) || !states.includes(raw.expectedStatus as string) || !stamp(raw.expectedUpdatedAt) || raw.clientMembershipId !== undefined) return fail("CHAT_MEMBER_INVALID");
  return { action: raw.action as "invite" | "remove" | "promote" | "demote", targetUserId: raw.targetUserId, expectedActorId: raw.expectedActorId, expectedFamilyId: raw.expectedFamilyId.toLowerCase(), expectedChannelUpdatedAt: raw.expectedChannelUpdatedAt,
    expectedMembershipId: absent ? null : (raw.expectedMembershipId as string).toLowerCase(), expectedRole: raw.expectedRole as "owner" | "moderator" | "member" | null, expectedStatus: raw.expectedStatus as "active" | "left" | null, expectedUpdatedAt: raw.expectedUpdatedAt as string | null,
    ...(absent ? { clientMembershipId: (raw.clientMembershipId as string).toLowerCase() } : {}) };
}
export type ChatMembershipInput = ReturnType<typeof chatMembershipInput>;
export function chatMembershipMayManage(channel: unknown, role: FamilyRole, own: unknown, familyId: string, actor: string) {
  return noticeObject(channel) && channel.family_id === familyId && channel.channel_type === "custom" && channel.visibility === "invite_only" && channel.status === "active"
    && canManageChatRole(role) && noticeObject(own) && own.family_id === familyId && own.channel_id === channel.id && own.auth_user_id === actor && own.status === "active" && own.role === "owner";
}
export function chatMembershipPublic(row: unknown) {
  if (!noticeObject(row) || !noticeUuid(row.id) || !account(row.auth_user_id) || !roles.includes(row.role as string) || !states.includes(row.status as string) || !levels.includes(row.notification_level as string) || !stamp(row.created_at) || !stamp(row.updated_at)) return fail("CHAT_MEMBER_UNKNOWN", 503);
  return { id: row.id, userId: row.auth_user_id, role: row.role as "owner" | "moderator" | "member", status: row.status as "active" | "left", notificationLevel: row.notification_level as "all" | "mentions" | "muted", createdAt: row.created_at, updatedAt: row.updated_at };
}
export type ManagedChatMember = ReturnType<typeof chatMembershipPublic>;
export function chatMembershipPlan(input: ChatMembershipInput, row: Record<string, unknown> | null, targetActive: boolean, actor: string) {
  if (input.targetUserId === actor || row?.role === "owner") return fail("CHAT_MEMBER_OWNER_PROTECTED", 403);
  if ((row?.id ?? null) !== input.expectedMembershipId || (row?.role ?? null) !== input.expectedRole || (row?.status ?? null) !== input.expectedStatus || (row?.updated_at ?? null) !== input.expectedUpdatedAt) return fail("CHAT_MEMBER_CHANGED", 409);
  if (input.action !== "remove" && !targetActive) return fail("CHAT_MEMBER_INELIGIBLE", 409);
  if (!row && input.action !== "invite" || row?.status === "left" && ["promote", "demote"].includes(input.action)) return fail("CHAT_MEMBER_CHANGED", 409);
  const status = input.action === "remove" ? "left" as const : "active" as const;
  const role = input.action === "promote" ? "moderator" as const : input.action === "demote" || input.action === "invite" && row?.status !== "active" ? "member" as const : row?.role as "member" | "moderator";
  return { status, role, noChange: !!row && row.status === status && row.role === role };
}
export async function chatMembershipWrite(o: { channelId: string; familyId: string; actorId: string; input: ChatMembershipInput; row: Record<string, unknown> | null; targetActive: boolean; write: (updatedAt: string, plan: ReturnType<typeof chatMembershipPlan>) => Promise<unknown>; audit: () => Promise<unknown>; rejected: (e: unknown) => boolean; now?: number }) {
  const { input, row } = o;
  if (input.expectedFamilyId !== o.familyId || input.expectedActorId !== o.actorId) return fail("CHAT_MEMBER_CHANGED", 409);
  if (row) {
    chatMembershipPublic(row);
    if (row.family_id !== o.familyId || row.channel_id !== o.channelId || row.auth_user_id !== input.targetUserId) return fail("CHAT_MEMBER_UNKNOWN", 503);
  }
  const plan = chatMembershipPlan(input, row, o.targetActive, o.actorId);
  if (plan.noChange) return { success: true, action: input.action, channelId: o.channelId, member: chatMembershipPublic(row), noChange: true, auditPending: false };
  const updatedAt = new Date(Math.max(o.now ?? Date.now(), row ? Date.parse(row.updated_at as string) + 1 : 0)).toISOString();
  let rows: unknown;
  try { rows = await o.write(updatedAt, plan); } catch (e) { return fail(o.rejected(e) ? "CHAT_MEMBER_CHANGED" : "CHAT_MEMBER_UNKNOWN", o.rejected(e) ? 409 : 503); }
  if (Array.isArray(rows) && !rows.length) return fail("CHAT_MEMBER_CHANGED", 409);
  if (!Array.isArray(rows) || rows.length !== 1 || !noticeObject(rows[0])) return fail("CHAT_MEMBER_UNKNOWN", 503);
  const saved = rows[0];
  const member = chatMembershipPublic(saved);
  if (saved.family_id !== o.familyId || saved.channel_id !== o.channelId || member.userId !== input.targetUserId || member.id !== (row?.id ?? input.clientMembershipId) || member.role !== plan.role || member.status !== plan.status
    || member.notificationLevel !== (row?.notification_level ?? "all") || Date.parse(member.updatedAt) !== Date.parse(updatedAt)
    || (row ? member.createdAt !== row.created_at : Date.parse(member.createdAt) !== Date.parse(updatedAt))) return fail("CHAT_MEMBER_UNKNOWN", 503);
  let auditPending = false; try { await o.audit(); } catch { auditPending = true; }
  return { success: true, action: input.action, channelId: o.channelId, member, noChange: false, auditPending };
}
export function chatMembershipAcknowledged(channelId: string, input: ChatMembershipInput, status: number, payload: unknown) {
  if (![200, 202].includes(status) || !noticeObject(payload) || payload.success !== true || payload.channelId !== channelId || payload.action !== input.action || typeof payload.noChange !== "boolean" || payload.auditPending !== (status === 202) || payload.outcomeUnknown === true || !noticeObject(payload.member)) return false;
  const m = payload.member;
  if (!noticeUuid(m.id) || m.id !== (input.expectedMembershipId ?? input.clientMembershipId) || m.userId !== input.targetUserId || !["member", "moderator"].includes(m.role as string) || !states.includes(m.status as string) || !levels.includes(m.notificationLevel as string) || !stamp(m.createdAt) || !stamp(m.updatedAt)
    || ["family_id", "channel_id", "auth_user_id"].some(k => Object.hasOwn(m, k))) return false;
  const desiredStatus = input.action === "remove" ? "left" : "active";
  const desiredRole = input.action === "promote" ? "moderator" : input.action === "demote" || input.action === "invite" && input.expectedStatus !== "active" ? "member" : input.expectedRole;
  if (m.status !== desiredStatus || m.role !== desiredRole) return false;
  const unchanged = input.expectedStatus === desiredStatus && input.expectedRole === desiredRole;
  return payload.noChange === unchanged && (unchanged ? !payload.auditPending && m.updatedAt === input.expectedUpdatedAt : !input.expectedUpdatedAt || Date.parse(m.updatedAt) > Date.parse(input.expectedUpdatedAt));
}
export type ChatMembershipSnapshot = { familyId: string; actorId: string; channel: { id: string; name: string; updatedAt: string }; members: ManagedChatMember[]; eligible: { userId: string; name: string }[] };
export function chatMembershipSnapshot(value: unknown): ChatMembershipSnapshot | null {
  if (!noticeObject(value) || !noticeUuid(value.familyId) || !account(value.actorId) || !noticeObject(value.channel) || !noticeUuid(value.channel.id) || typeof value.channel.name !== "string" || !value.channel.name || !stamp(value.channel.updatedAt)
    || !Array.isArray(value.members) || value.members.length > 20000 || !Array.isArray(value.eligible) || value.eligible.length > 20000) return null;
  const ids = new Set(), users = new Set();
  for (const m of value.members) {
    if (!noticeObject(m) || !noticeUuid(m.id) || !account(m.userId) || ids.has(m.id) || users.has(m.userId) || !roles.includes(m.role as string) || !states.includes(m.status as string) || !levels.includes(m.notificationLevel as string) || !stamp(m.createdAt) || !stamp(m.updatedAt)
      || ["family_id", "channel_id", "auth_user_id"].some(k => Object.hasOwn(m, k))) return null;
    ids.add(m.id); users.add(m.userId);
  }
  const eligibleIds = new Set();
  for (const e of value.eligible) { if (!noticeObject(e) || !account(e.userId) || e.userId === value.actorId || eligibleIds.has(e.userId) || typeof e.name !== "string" || !e.name || e.name.length > 180) return null; eligibleIds.add(e.userId); }
  if (!value.members.some(m => noticeObject(m) && m.userId === value.actorId && m.role === "owner" && m.status === "active")) return null;
  return value as ChatMembershipSnapshot;
}
export function chatMembershipCopy(code: unknown, locale: "bn" | "en") {
  const messages: Record<string, [string, string]> = {
    CHAT_MEMBER_INVALID: ["সঠিক member, action ও বর্তমান version দিন।", "Provide a valid member, action and current version."],
    CHAT_MEMBER_FORBIDDEN: ["এই private group-এর সদস্য পরিচালনায় অনুমোদিত group owner হতে হবে।", "You must be an authorized group owner to manage this private group's members."],
    CHAT_MEMBER_OWNER_PROTECTED: ["Group owner বা নিজের membership সরানো কিংবা role বদলানো যাবে না।", "The group owner or your own membership cannot be removed or changed."],
    CHAT_MEMBER_INELIGIBLE: ["এই account পরিবারের active approved member নয়। আগে family approval সম্পন্ন করতে হবে।", "This account is not an active approved family member. Complete family approval first."],
    CHAT_MEMBER_CHANGED: ["পরিবার, channel বা membership বদলেছে। বর্তমান তালিকা লোড করে যাচাই করুন।", "The family, channel or membership changed. Load the current list and review it."],
    CHAT_MEMBER_NOT_FOUND: ["অনুমোদিত active private group পাওয়া যায়নি।", "An authorized active private group was not found."],
    CHAT_MEMBER_UNKNOWN: ["Membership পরিবর্তন সংরক্ষিত হতে পারে। আবার পাঠাবেন না; বর্তমান তালিকা লোড করে যাচাই করুন।", "The membership change may already be saved. Do not resubmit; load the current list to verify."],
    CHAT_MEMBER_AUDIT_PENDING: ["Membership সংরক্ষিত; audit pending। আবার পরিবর্তন পাঠাবেন না; Support-এর সহায়তা নিন।", "Membership is saved; its audit is pending. Do not repeat the change; contact support."],
    CHAT_MEMBER_LOAD: ["সম্পূর্ণ অনুমোদিত membership তালিকা লোড হয়নি। পুরোনো তথ্য সরানো হয়েছে; আবার লোড করুন।", "A complete authorized membership list could not be loaded. Previous data was cleared; reload."],
  };
  return (messages[typeof code === "string" ? code : ""] ?? messages.CHAT_MEMBER_UNKNOWN)[locale === "bn" ? 0 : 1];
}
export function chatMembershipActionCopy(path: string, method: string, body: Record<string, unknown>, locale: "bn" | "en") {
  if (!/^\/api\/chat-channels\/[^/]+\/members$/.test(path) || method !== "POST") return null;
  const pick = (bn: string, en: string) => locale === "bn" ? bn : en;
  const description = body.action === "remove" ? pick("এই সদস্যের group access বন্ধ হবে। Profile, message ও file মুছবে না; নতুন invite ছাড়া আবার access পাবে না।", "This member loses group access. Profile, messages and files remain; access requires a new invitation.")
    : body.action === "invite" ? pick("Approved family member এই private group-এর আগের history ও file-এ access পাবে। Re-invite হলে member role হবে; notification পছন্দ থাকবে।", "The approved family member gains access to this group's existing history and files. Reinvitation uses member role and preserves notification preferences.")
    : pick("শুধু group role বদলাবে। এটি family admin permission বা অন্যের message edit/delete করার অনুমতি দেয় না।", "Only the group role changes. It does not grant family-admin permissions or permission to edit/delete another person's messages.");
  return { title: pick("Membership পরিবর্তন নিশ্চিত করুন", "Confirm membership change"), description, destructive: body.action === "remove" || body.action === "demote", confirmLabel: pick("হ্যাঁ, নিশ্চিত করুন", "Yes, confirm"), successMessage: pick("Membership সংরক্ষিত হয়েছে।", "Membership saved.") };
}
export function chatMembershipFeedback(path: string, status: number, value: unknown, locale: "bn" | "en", method: string, body: Record<string, unknown>) {
  if (!/^\/api\/chat-channels\/[^/]+\/members$/.test(path) || method !== "POST") return null;
  let confirmed = false; try { confirmed = chatMembershipAcknowledged(path.split("/").at(-2)!, chatMembershipInput(body), status, value); } catch { /* Invalid response never succeeds. */ }
  const p = noticeObject(value) ? value : {};
  const unknown = !confirmed && (status < 400 || status >= 500 || status === 408 || p.outcomeUnknown === true);
  const kind = confirmed && status !== 202 && !p.noChange ? "success" as const : confirmed || unknown ? "info" as const : "error" as const;
  return { kind, title: locale === "bn" ? (kind === "success" ? "সংরক্ষিত" : kind === "error" ? "Error" : "যাচাই প্রয়োজন") : kind === "success" ? "Saved" : kind === "error" ? "Error" : "Review needed",
    message: confirmed ? status === 202 ? chatMembershipCopy("CHAT_MEMBER_AUDIT_PENDING", locale) : locale === "bn" ? (p.noChange ? "পরিবর্তন প্রয়োজন নেই।" : "Membership সংরক্ষিত; profile/history অপরিবর্তিত।") : p.noChange ? "No change needed." : "Membership saved; profile/history unchanged." : chatMembershipCopy(unknown ? "CHAT_MEMBER_UNKNOWN" : p.code, locale) };
}
