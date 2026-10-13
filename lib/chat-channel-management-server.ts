import { chatLifecycleAllowed, ChatChannelError } from "./chat-channel-lifecycle";
import type { ActiveFamilyMembership } from "./family-access";
import { readAllSupabaseRows } from "./supabase-pagination";
import type { ChatChannelRow, ChatChannelMemberRow } from "./family-chat";
export const chatChannelColumns = "id,family_id,name,description,channel_type,visibility,direct_key,status,created_by_user_id,created_at,updated_at";
// Deliberately separate from getAccessibleChatChannel: an archived management
// lookup must never grant message/upload/file access to an archived channel.
export async function getManagedChatChannels(membership: ActiveFamilyMembership, actor: string, id?: string) {
  const q = new URLSearchParams({ select: chatChannelColumns, family_id: `eq.${membership.family_id}`, channel_type: "in.(custom,admin)", order: "updated_at.desc,id.asc", ...(id ? { id: `eq.${id}` } : {}) });
  const m = new URLSearchParams({ select: "id,channel_id,auth_user_id,role,notification_level,status,updated_at", family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${actor}`, status: "eq.active", order: "id.asc", ...(id ? { channel_id: `eq.${id}` } : {}) });
  const [channels, members] = await Promise.all([readAllSupabaseRows<ChatChannelRow>("chat_channels", q), readAllSupabaseRows<ChatChannelMemberRow>("chat_channel_members", m)]);
  if (!Array.isArray(channels) || !Array.isArray(members) || channels.some(c => c.family_id !== membership.family_id)) throw new ChatChannelError("CHAT_CHANNEL_LOAD", 503);
  return channels.filter(c => chatLifecycleAllowed(c, membership.role, members.find(member => member.channel_id === c.id) ?? null)).map(c => ({ ...c,
    can_manage_members: c.channel_type === "custom" && c.visibility === "invite_only" && c.status === "active" && members.some(m => m.channel_id === c.id && m.role === "owner" && m.status === "active"),
  }));
}
