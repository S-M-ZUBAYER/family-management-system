import { noticeObject, noticeUuid, noticeTimestamp } from "./notice-validation.ts";
import { canAccessChatChannel, canManageChatRole } from "./chat-access-policy.ts";
import { chatFeedSnapshot } from "./chat-text-management.ts";
import type { FamilyRole } from "./family-access";
const roles = ["owner", "family_admin", "manager", "member"];
const account = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 240 && !/[\u0000-\u001f\u007f]/.test(v);
const stamp = (v: unknown): v is string => { try { return typeof v === "string" && !!noticeTimestamp(v); } catch { return false; } };
export type ChatMetadata = {
  family: { id: string; name_bn: string; name_en: string };
  viewer: { authUserId: string; name: string; role: FamilyRole };
  members: { authUserId: string; name: string; initials: string; role: FamilyRole }[];
  channels: { id: string; name: string; description: string | null; channelType: "general" | "custom" | "admin" | "direct" | "event" | "qurbani"; visibility: "family" | "admins" | "invite_only"; updatedAt: string; unreadCount: number; memberCount: number; memberIds: string[]; notificationLevel: "all" | "mentions" | "muted"; ownPreference: { membershipId: string; updatedAt: string } | null }[];
  migrationRequired: boolean; permissions: { canManage: boolean };
};
export function chatMetadataSnapshot(raw: unknown): ChatMetadata | null {
  if (!noticeObject(raw) || !noticeObject(raw.family) || !noticeUuid(raw.family.id) || typeof raw.family.name_bn !== "string" || !raw.family.name_bn || typeof raw.family.name_en !== "string"
    || !noticeObject(raw.viewer) || !account(raw.viewer.authUserId) || typeof raw.viewer.name !== "string" || !raw.viewer.name || !roles.includes(raw.viewer.role as string)
    || !Array.isArray(raw.members) || raw.members.length > 20000 || !Array.isArray(raw.channels) || raw.channels.length > 20000 || typeof raw.migrationRequired !== "boolean" || !noticeObject(raw.permissions)
    || raw.permissions.canManage !== canManageChatRole(raw.viewer.role as FamilyRole) || raw.migrationRequired && raw.channels.length) return null;
  const users = new Set<string>(), ids = new Set<string>();
  for (const m of raw.members) {
    if (!noticeObject(m) || !account(m.authUserId) || users.has(m.authUserId) || typeof m.name !== "string" || !m.name || m.name.length > 180 || typeof m.initials !== "string" || !roles.includes(m.role as string)) return null;
    users.add(m.authUserId);
  }
  const own = raw.members.find(m => noticeObject(m) && m.authUserId === (raw.viewer as Record<string, unknown>).authUserId);
  if (!own || own.role !== raw.viewer.role || own.name !== raw.viewer.name) return null;
  for (const c of raw.channels) {
    if (!noticeObject(c) || !noticeUuid(c.id) || ids.has(c.id) || typeof c.name !== "string" || !c.name || c.name.length > 180 || !(c.description === null || typeof c.description === "string" && c.description.length <= 500)
      || !["general", "custom", "admin", "direct", "event", "qurbani"].includes(c.channelType as string) || !["family", "admins", "invite_only"].includes(c.visibility as string) || !stamp(c.updatedAt)
      || !Number.isSafeInteger(c.unreadCount) || (c.unreadCount as number) < 0 || !Number.isSafeInteger(c.memberCount) || (c.memberCount as number) < 0 || !Array.isArray(c.memberIds) || c.memberIds.length > 20000 || c.memberIds.some(v => !account(v)) || new Set(c.memberIds).size !== c.memberIds.length
      || !["all", "mentions", "muted"].includes(c.notificationLevel as string) || !(c.ownPreference === null || noticeObject(c.ownPreference) && noticeUuid(c.ownPreference.membershipId) && stamp(c.ownPreference.updatedAt))
      || c.ownPreference === null && c.notificationLevel !== "all" || !canAccessChatChannel(c.visibility as "family" | "admins" | "invite_only", raw.viewer.role as FamilyRole, c.memberIds.includes(raw.viewer.authUserId))
      || ["family_id", "created_by_user_id", "direct_key"].some(k => Object.hasOwn(c, k))) return null;
    ids.add(c.id);
  }
  return raw as ChatMetadata;
}
export type ChatScope = { familyId: string; actorId: string };
export function chatScopedFeed(raw: unknown, channelId: string, scope: ChatScope, max = 150) {
  if (!noticeObject(raw) || !noticeObject(raw.scope) || raw.scope.familyId !== scope.familyId || raw.scope.actorId !== scope.actorId) return null;
  return chatFeedSnapshot(raw, channelId, max);
}
export class ChatReadError extends Error { readonly code: string; constructor(code: string) { super(code); this.code = code; } }
export class ChatReadGate {
  private token: { controller: AbortController } | null = null;
  begin() { this.token?.controller.abort(); const token = { controller: new AbortController() }; this.token = token; return token; }
  current(token: { controller: AbortController }) { return this.token === token && !token.controller.signal.aborted; }
  invalidate() { this.token?.controller.abort(); this.token = null; }
}
// Deadline covers fetch AND JSON even if a test/proxy ignores AbortSignal.
// No implicit retry. Callers suppress obsolete effects with ChatReadGate.
export async function readChatJson<T>(request: (init: RequestInit) => Promise<Response>, validate: (raw: unknown) => T | null, signal?: AbortSignal, timeoutMs = 25000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new ChatReadError("CHAT_READ_TIMEOUT")); controller.abort(); }, timeoutMs); });
  const aborted = new Promise<never>((_, reject) => { onAbort = () => { reject(new ChatReadError("CHAT_READ_SUPERSEDED")); controller.abort(); }; signal?.addEventListener("abort", onAbort, { once: true }); if (signal?.aborted) onAbort(); });
  try {
    const r = await Promise.race([request({ cache: "no-store", signal: controller.signal }), timeout, aborted]);
    if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 413) throw new ChatReadError(r.status === 401 ? "CHAT_READ_SIGN_IN" : r.status === 403 || r.status === 404 ? "CHAT_READ_ACCESS" : "CHAT_ROW_LIMIT");
    const raw: unknown = await Promise.race([r.json(), timeout, aborted]);
    if (r.status === 409) throw new ChatReadError(noticeObject(raw) && raw.code === "FAMILY_SETUP_REQUIRED" ? "CHAT_READ_SETUP" : "CHAT_READ_ACCESS");
    if (!r.ok) throw new ChatReadError("CHAT_READ_FAILED");
    const result = validate(raw); if (!result) throw new ChatReadError("CHAT_READ_INVALID");
    return result;
  } catch (e) { throw e instanceof ChatReadError ? e : new ChatReadError("CHAT_READ_FAILED"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}
export function chatReadCopy(code: unknown, locale: "bn" | "en") {
  const copy: Record<string, [string, string]> = {
    CHAT_READ_TIMEOUT: ["Chat লোডের সময় শেষ। পুরোনো তথ্য দেখানো হচ্ছে না; Retry করুন।", "Chat loading timed out. Previous data is hidden; retry."],
    CHAT_READ_INVALID: ["সম্পূর্ণ সঠিক Chat তথ্য পাওয়া যায়নি। পরিবর্তন/export বন্ধ; আবার লোড করুন।", "A complete valid Chat snapshot was not received. Changes/export are disabled; reload."],
    CHAT_READ_SIGN_IN: ["Chat দেখতে sign in করুন।", "Sign in to view Chat."],
    CHAT_READ_ACCESS: ["পরিবার বা channel access বদলেছে। অনুমোদিত তালিকা আবার লোড করুন।", "Family or channel access changed. Reload the authorized list."],
    CHAT_READ_SETUP: ["আগে family setup সম্পন্ন করুন।", "Complete family setup first."],
    CHAT_READ_SUPERSEDED: ["Chat context বদলেছে; পুরোনো read/export ব্যবহার করা হয়নি।", "Chat context changed; the obsolete read/export was not used."],
    CHAT_ROW_LIMIT: ["একটি Chat section ২০,০০০ সারি ছাড়িয়েছে। অসম্পূর্ণ export হবে না; Support-এর সহায়তা নিন।", "A Chat section exceeds 20,000 rows. No partial export will be made; contact support."],
    CHAT_READ_FAILED: ["Chat লোড হয়নি। পুরোনো তথ্য সরানো হয়েছে; Retry করুন।", "Chat could not be loaded. Previous data was cleared; retry."],
  };
  return (copy[typeof code === "string" ? code : ""] ?? copy.CHAT_READ_FAILED)[locale === "bn" ? 0 : 1];
}
