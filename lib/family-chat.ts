import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { applyChatCursorFilter, parseChatCursor } from "@/lib/chat-cursor";
import { canAccessChatChannel } from "@/lib/chat-access-policy";
import { type ActiveFamilyMembership } from "@/lib/family-access";
import { PaginatedRowLimitError } from "@/lib/paginated-rows";
import { readAllSupabaseRows } from "@/lib/supabase-pagination";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

export type ChatChannelType =
  | "general"
  | "custom"
  | "event"
  | "qurbani"
  | "admin"
  | "direct";

export type ChatChannelVisibility = "family" | "admins" | "invite_only";

export type ChatChannelRow = {
  id: string;
  family_id: string;
  name: string;
  description: string | null;
  channel_type: ChatChannelType;
  visibility: ChatChannelVisibility;
  direct_key: string | null;
  status: "active" | "archived";
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type ChatChannelMemberRow = {
  id: string;
  channel_id: string;
  auth_user_id: string;
  role: "owner" | "moderator" | "member";
  notification_level: "all" | "mentions" | "muted";
  status: "active" | "left";
};

export type ChatMessageRow = {
  id: string;
  channel_id: string;
  auth_user_id: string;
  author_name: string;
  message_type: "text" | "attachment" | "system";
  body: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
};

export type ChatAttachmentRow = {
  id: string;
  channel_id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

export type ChatReactionRow = {
  id: string;
  message_id: string;
  auth_user_id: string;
  emoji: string;
  created_at: string;
};

export async function getChatAuthorName(
  familyId: string,
  user: ChatGPTUser,
) {
  const query = new URLSearchParams({
    select: "name_bn,name_en",
    family_id: `eq.${familyId}`,
    auth_user_id: `eq.${user.userId}`,
    profile_status: "eq.active",
    limit: "1",
  });
  const profile = (
    await supabaseRest<Array<{ name_bn: string; name_en: string | null }>>(
      `member_profiles?${query}`,
    )
  )[0];
  return (profile?.name_bn || profile?.name_en || user.fullName || "পরিবারের সদস্য").slice(0, 180);
}

export async function getAccessibleChatChannel(
  membership: ActiveFamilyMembership,
  authUserId: string,
  channelId: string,
) {
  const channelQuery = new URLSearchParams({
    select:
      "id,family_id,name,description,channel_type,visibility,direct_key,status,created_by_user_id,created_at,updated_at",
    id: `eq.${channelId}`,
    family_id: `eq.${membership.family_id}`,
    status: "eq.active",
    limit: "1",
  });
  const channel = (
    await supabaseRest<ChatChannelRow[]>(`chat_channels?${channelQuery}`)
  )[0];
  if (!channel) return null;

  if (channel.visibility !== "invite_only") {
    return canAccessChatChannel(channel.visibility, membership.role, false) ? channel : null;
  }

  const memberQuery = new URLSearchParams({
    select: "id,channel_id,auth_user_id,role,notification_level,status",
    family_id: `eq.${membership.family_id}`,
    channel_id: `eq.${channel.id}`,
    auth_user_id: `eq.${authUserId}`,
    status: "eq.active",
    limit: "1",
  });
  const channelMember = (
    await supabaseRest<ChatChannelMemberRow[]>(
      `chat_channel_members?${memberQuery}`,
    )
  )[0];
  return canAccessChatChannel(channel.visibility, membership.role, Boolean(channelMember)) ? channel : null;
}

export async function loadChatMessages(
  membership: ActiveFamilyMembership,
  user: ChatGPTUser,
  channelId: string,
  after?: string | null,
) {
  const cursor = after ? parseChatCursor(after) : null;
  if (after && !cursor) throw new Error("Invalid chat cursor.");
  const queryEntries: Record<string, string> = {
    select:
      "id,channel_id,auth_user_id,author_name,message_type,body,reply_to_id,edited_at,created_at",
    family_id: `eq.${membership.family_id}`,
    channel_id: `eq.${channelId}`,
    order: after ? "created_at.asc,id.asc" : "created_at.desc,id.desc",
    limit: after ? "200" : "150",
  };
  const query = new URLSearchParams(queryEntries);
  if (cursor) applyChatCursorFilter(query, cursor);
  const rows = await supabaseRest<ChatMessageRow[]>(`chat_messages?${query}`);
  const messages = after ? rows : rows.reverse();
  if (!messages.length) return { messages: [], reactions: [], attachments: [] };

  const messageIds = messages.map((message) => message.id).join(",");
  const reactionQuery = new URLSearchParams({
    select: "id,message_id,auth_user_id,emoji,created_at",
    family_id: `eq.${membership.family_id}`,
    message_id: `in.(${messageIds})`,
    order: "created_at.asc",
  });
  const attachmentQuery = new URLSearchParams({
    select: "id,channel_id,message_id,file_name,mime_type,file_size,created_at",
    family_id: `eq.${membership.family_id}`,
    message_id: `in.(${messageIds})`,
    order: "created_at.asc",
  });
  const [reactionRows, attachments] = await Promise.all([
    supabaseRest<ChatReactionRow[]>(`chat_message_reactions?${reactionQuery}`),
    supabaseRest<ChatAttachmentRow[]>(`chat_attachments?${attachmentQuery}`),
  ]);
  return {
    messages: messages.map(({ auth_user_id, ...message }) => ({
      ...message,
      is_mine: auth_user_id === user.userId,
    })),
    reactions: reactionRows.map(({ auth_user_id, ...reaction }) => ({
      ...reaction,
      is_mine: auth_user_id === user.userId,
    })),
    attachments,
  };
}

export async function loadChatExport(
  membership: ActiveFamilyMembership,
  user: ChatGPTUser,
  channelId: string,
) {
  const familyFilter = `eq.${membership.family_id}`;
  const messages = await readAllSupabaseRows<ChatMessageRow>("chat_messages", new URLSearchParams({
    select: "id,channel_id,auth_user_id,author_name,message_type,body,reply_to_id,edited_at,created_at",
    family_id: familyFilter,
    channel_id: `eq.${channelId}`,
    order: "created_at.asc,id.asc",
  }));
  const attachments = await readAllSupabaseRows<ChatAttachmentRow>("chat_attachments", new URLSearchParams({
    select: "id,channel_id,message_id,file_name,mime_type,file_size,created_at",
    family_id: familyFilter,
    channel_id: `eq.${channelId}`,
    order: "created_at.asc,id.asc",
  }));
  const reactions: ChatReactionRow[] = [];
  for (let offset = 0; offset < messages.length; offset += 400) {
    const slices = [0, 100, 200, 300]
      .map((start) => messages.slice(offset + start, offset + start + 100))
      .filter((slice) => slice.length > 0);
    const batches = await Promise.all(slices.map((slice) => readAllSupabaseRows<ChatReactionRow>("chat_message_reactions", new URLSearchParams({
      select: "id,message_id,auth_user_id,emoji,created_at",
      family_id: familyFilter,
      message_id: `in.(${slice.map((message) => message.id).join(",")})`,
      order: "created_at.asc,id.asc",
    }))));
    for (const batch of batches) reactions.push(...batch);
    if (reactions.length > 20000) throw new PaginatedRowLimitError(20000);
  }
  return {
    messages: messages.map(({ auth_user_id, ...message }) => ({ ...message, is_mine: auth_user_id === user.userId })),
    reactions: reactions.map(({ auth_user_id, ...reaction }) => ({ ...reaction, is_mine: auth_user_id === user.userId })),
    attachments,
  };
}

export function chatErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof PaginatedRowLimitError) {
    return Response.json({ code: "CHAT_ROW_LIMIT", maxRows: error.maxRows, error: `Chat history or roster exceeds ${error.maxRows} rows in one section. No partial chat data was shown or exported; contact support for a paged export.` }, { status: 413 });
  }
  if (error instanceof BackendNotConfiguredError) {
    return Response.json({ error: "PostgreSQL backend configured নয়।" }, { status: 503 });
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json(
      { error: "Chat data সাময়িকভাবে পাওয়া যাচ্ছে না।" },
      { status: 502 },
    );
  }
  console.error(logMessage, error);
  return Response.json({ error: "Chat request সম্পন্ন হয়নি।" }, { status: 500 });
}
