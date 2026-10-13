import { supabaseRest } from "./supabase-rest";
import { readAllSupabaseRows } from "./supabase-pagination";
import { getManagedChatChannels } from "./chat-channel-management-server";
import { chatMembershipMayManage, chatMembershipPublic, ChatMembershipError } from "./chat-membership-workflow";
import type { ActiveFamilyMembership } from "./family-access";
import { noticeObject } from "./notice-validation";

export const chatMemberColumns = "id,family_id,channel_id,auth_user_id,role,notification_level,status,created_at,updated_at";
export async function getOwnedPrivateChat(membership: ActiveFamilyMembership, actor: string, id: string) {
  const channel = (await getManagedChatChannels(membership, actor, id))[0];
  if (!channel || channel.channel_type !== "custom" || channel.visibility !== "invite_only" || channel.status !== "active") throw new ChatMembershipError("CHAT_MEMBER_NOT_FOUND", 404);
  const own = await supabaseRest<unknown>(`chat_channel_members?${new URLSearchParams({ select: chatMemberColumns, family_id: `eq.${membership.family_id}`, channel_id: `eq.${id}`, auth_user_id: `eq.${actor}`, status: "eq.active", limit: "2" })}`);
  if (!Array.isArray(own) || own.length !== 1 || !chatMembershipMayManage(channel, membership.role, own[0], membership.family_id, actor)) throw new ChatMembershipError("CHAT_MEMBER_FORBIDDEN", 403);
  chatMembershipPublic(own[0]);
  return channel;
}
export async function getChatMemberSnapshot(membership: ActiveFamilyMembership, actor: string, id: string) {
  const channel = await getOwnedPrivateChat(membership, actor, id);
  const family = membership.family_id;
  const [rows, accounts, profiles] = await Promise.all([
    readAllSupabaseRows<Record<string, unknown>>("chat_channel_members", new URLSearchParams({ select: chatMemberColumns, family_id: `eq.${family}`, channel_id: `eq.${id}`, order: "created_at.asc,id.asc" })),
    readAllSupabaseRows<{ auth_user_id: string }>("family_memberships", new URLSearchParams({ select: "auth_user_id", family_id: `eq.${family}`, status: "eq.active", order: "id.asc" })),
    readAllSupabaseRows<{ auth_user_id: string; name_bn: string; name_en: string | null }>("member_profiles", new URLSearchParams({ select: "auth_user_id,name_bn,name_en", family_id: `eq.${family}`, auth_user_id: "not.is.null", profile_status: "eq.active", order: "id.asc" })),
  ]);
  if (rows.some(r => !noticeObject(r) || r.family_id !== family || r.channel_id !== id)) throw new ChatMembershipError("CHAT_MEMBER_LOAD", 503);
  const names = new Map(profiles.map(p => [p.auth_user_id, (p.name_bn || p.name_en || "Family member").slice(0, 180)]));
  return { familyId: family, actorId: actor, channel: { id: channel.id, name: channel.name, updatedAt: channel.updated_at }, members: rows.map(chatMembershipPublic), eligible: accounts.filter(a => a.auth_user_id !== actor).map(a => ({ userId: a.auth_user_id, name: names.get(a.auth_user_id) ?? "Family member" })) };
}
