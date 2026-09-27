import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  canManageChat,
  getActiveFamilyMembership,
  type FamilyRole,
} from "@/lib/family-access";
import {
  chatErrorResponse,
  getChatAuthorName,
  getAccessibleChatChannel,
  loadChatMessages,
  type ChatChannelMemberRow,
  type ChatChannelRow,
  type ChatMessageRow,
} from "@/lib/family-chat";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

type SafeMember = {
  authUserId: string;
  name: string;
  initials: string;
  role: FamilyRole;
};

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const uuidValue = (value: unknown) => {
  const valueText = textValue(value, 50);
  return valueText && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valueText)
    ? valueText
    : null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function getSafeFamilyMembers(familyId: string, currentUser: { userId: string; displayName: string }) {
  const membershipQuery = new URLSearchParams({
    select: "auth_user_id,member_profile_id,role",
    family_id: `eq.${familyId}`,
    status: "eq.active",
    order: "created_at.asc",
  });
  const profileQuery = new URLSearchParams({
    select: "auth_user_id,name_bn,name_en",
    family_id: `eq.${familyId}`,
    auth_user_id: "not.is.null",
    profile_status: "eq.active",
  });
  const [memberships, profiles] = await Promise.all([
    supabaseRest<Array<{ auth_user_id: string; member_profile_id: string | null; role: FamilyRole }>>(
      `family_memberships?${membershipQuery}`,
    ),
    supabaseRest<Array<{ auth_user_id: string; name_bn: string; name_en: string | null }>>(
      `member_profiles?${profileQuery}`,
    ),
  ]);
  const names = new Map(profiles.map((profile) => [profile.auth_user_id, profile.name_bn || profile.name_en || "Family member"]));
  return memberships.map<SafeMember>((membership) => {
    const name = names.get(membership.auth_user_id)
      ?? (membership.auth_user_id === currentUser.userId ? currentUser.displayName : "পরিবারের সদস্য");
    return {
      authUserId: membership.auth_user_id,
      name,
      initials: initials(name),
      role: membership.role,
    };
  });
}

export async function GET(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json(
        { code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" },
        { status: 409 },
      );
    }

    const url = new URL(request.url);
    const channelId = uuidValue(url.searchParams.get("channelId"));
    const after = textValue(url.searchParams.get("after"), 50);
    if (url.searchParams.has("channelId") && !channelId) {
      return Response.json({ error: "Channel id সঠিক নয়।" }, { status: 400 });
    }
    if (channelId) {
      const channel = await getAccessibleChatChannel(membership, user.userId, channelId);
      if (!channel) return Response.json({ error: "Channel পাওয়া যায়নি।" }, { status: 404 });
      const feed = await loadChatMessages(membership, user, channel.id, after);
      return Response.json({ channel, ...feed });
    }

    const familyQuery = new URLSearchParams({
      select: "id,name_bn,name_en",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const channelQuery = new URLSearchParams({
      select: "id,family_id,name,description,channel_type,visibility,direct_key,status,created_by_user_id,created_at,updated_at",
      family_id: `eq.${membership.family_id}`,
      status: "eq.active",
      order: "updated_at.desc",
    });
    const channelMemberQuery = new URLSearchParams({
      select: "id,channel_id,auth_user_id,role,notification_level,status",
      family_id: `eq.${membership.family_id}`,
      status: "eq.active",
    });
    const receiptQuery = new URLSearchParams({
      select: "channel_id,last_read_at,last_read_message_id",
      family_id: `eq.${membership.family_id}`,
      auth_user_id: `eq.${user.userId}`,
    });
    const recentMessageQuery = new URLSearchParams({
      select: "id,channel_id,auth_user_id,created_at",
      family_id: `eq.${membership.family_id}`,
      order: "created_at.desc",
      limit: "1000",
    });

    let migrationRequired = false;
    let channels: ChatChannelRow[] = [];
    let channelMembers: ChatChannelMemberRow[] = [];
    let receipts: Array<{ channel_id: string; last_read_at: string; last_read_message_id: string | null }> = [];
    let recentMessages: Array<{ id: string; channel_id: string; auth_user_id: string; created_at: string }> = [];
    const [family, members] = await Promise.all([
      supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${familyQuery}`),
      getSafeFamilyMembers(membership.family_id, user),
    ]);
    try {
      [channels, channelMembers, receipts, recentMessages] = await Promise.all([
        supabaseRest<ChatChannelRow[]>(`chat_channels?${channelQuery}`),
        supabaseRest<ChatChannelMemberRow[]>(`chat_channel_members?${channelMemberQuery}`),
        supabaseRest<typeof receipts>(`chat_read_receipts?${receiptQuery}`),
        supabaseRest<typeof recentMessages>(`chat_messages?${recentMessageQuery}`),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
      else throw error;
    }

    const memberChannelIds = new Set(
      channelMembers
        .filter((item) => item.auth_user_id === user.userId)
        .map((item) => item.channel_id),
    );
    const accessible = channels.filter((channel) =>
      channel.visibility === "family"
      || (channel.visibility === "admins" && canManageChat(membership.role))
      || memberChannelIds.has(channel.id),
    );
    const receiptsByChannel = new Map(receipts.map((receipt) => [receipt.channel_id, receipt]));
    const membersById = new Map(members.map((member) => [member.authUserId, member]));

    const safeChannels = accessible.map((channel) => {
      const explicitMembers = channelMembers.filter((item) => item.channel_id === channel.id);
      const readAt = receiptsByChannel.get(channel.id)?.last_read_at;
      const unreadCount = recentMessages.filter(
        (message) =>
          message.channel_id === channel.id
          && message.auth_user_id !== user.userId
          && (!readAt || new Date(message.created_at).getTime() > new Date(readAt).getTime()),
      ).length;
      const otherDirectMember = channel.channel_type === "direct"
        ? explicitMembers
            .map((item) => membersById.get(item.auth_user_id))
            .find((item) => item && item.authUserId !== user.userId)
        : null;
      const ownChannelMembership = explicitMembers.find((item) => item.auth_user_id === user.userId);
      return {
        id: channel.id,
        name: otherDirectMember?.name ?? channel.name,
        description: channel.description,
        channelType: channel.channel_type,
        visibility: channel.visibility,
        updatedAt: channel.updated_at,
        unreadCount,
        memberCount:
          channel.visibility === "family"
            ? members.length
            : channel.visibility === "admins"
              ? members.filter((member) => member.role !== "member").length
              : explicitMembers.length,
        memberIds: explicitMembers.map((item) => item.auth_user_id),
        notificationLevel: ownChannelMembership?.notification_level ?? "all",
      };
    });

    return Response.json({
      family: family[0],
      viewer: {
        authUserId: user.userId,
        name: members.find((member) => member.authUserId === user.userId)?.name ?? "পরিবারের সদস্য",
        role: membership.role,
      },
      members,
      channels: safeChannels,
      migrationRequired,
      permissions: { canManage: canManageChat(membership.role) },
    });
  } catch (error) {
    return chatErrorResponse(error, "Unable to load family chat");
  }
}

export async function POST(request: Request) {
  let createdChannelId: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const action = textValue(body.action, 40);

    if (action === "create_channel") {
      const channelType = textValue(body.channelType, 20);
      if (!channelType || !["custom", "admin", "direct"].includes(channelType)) {
        return Response.json({ error: "Channel type সঠিক নয়।" }, { status: 400 });
      }
      const members = await getSafeFamilyMembers(membership.family_id, user);
      const validAuthIds = new Set(members.map((member) => member.authUserId));
      const requestedAuthIds = Array.isArray(body.memberIds)
        ? [...new Set(body.memberIds.filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 240))]
        : [];
      if (requestedAuthIds.some((id) => !validAuthIds.has(id))) {
        return Response.json({ error: "শুধু active family member নির্বাচন করুন।" }, { status: 400 });
      }

      if (channelType === "direct") {
        const targetId = requestedAuthIds.find((id) => id !== user.userId);
        if (!targetId) return Response.json({ error: "একজন family member নির্বাচন করুন।" }, { status: 400 });
        const directKey = [user.userId, targetId].sort().join(":");
        const existingQuery = new URLSearchParams({
          select: "id",
          family_id: `eq.${membership.family_id}`,
          direct_key: `eq.${directKey}`,
          status: "eq.active",
          limit: "1",
        });
        const existing = (await supabaseRest<Array<{ id: string }>>(`chat_channels?${existingQuery}`))[0];
        if (existing) return Response.json({ channelId: existing.id, existing: true });
        const target = members.find((member) => member.authUserId === targetId)!;
        const [channel] = await supabaseRest<ChatChannelRow[]>("chat_channels", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            family_id: membership.family_id,
            name: `Direct · ${target.name}`,
            description: "ব্যক্তিগত কথোপকথন",
            channel_type: "direct",
            visibility: "invite_only",
            direct_key: directKey,
            created_by_user_id: user.userId,
          }),
        });
        createdChannelId = channel.id;
        await supabaseRest("chat_channel_members", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify([
            { family_id: membership.family_id, channel_id: channel.id, auth_user_id: user.userId, role: "owner" },
            { family_id: membership.family_id, channel_id: channel.id, auth_user_id: targetId, role: "member" },
          ]),
        });
        return Response.json({ channelId: channel.id }, { status: 201 });
      }

      if (!canManageChat(membership.role)) {
        return Response.json({ error: "Group channel তৈরি করার permission নেই।" }, { status: 403 });
      }
      const name = textValue(body.name, 100);
      if (!name || name.length < 2) {
        return Response.json({ error: "Channel name দিন।" }, { status: 400 });
      }
      const visibility = channelType === "admin"
        ? "admins"
        : body.visibility === "invite_only" ? "invite_only" : "family";
      const [channel] = await supabaseRest<ChatChannelRow[]>("chat_channels", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          family_id: membership.family_id,
          name,
          description: textValue(body.description, 500),
          channel_type: channelType,
          visibility,
          created_by_user_id: user.userId,
        }),
      });
      createdChannelId = channel.id;
      if (visibility === "invite_only") {
        const selectedIds = [...new Set([user.userId, ...requestedAuthIds])];
        await supabaseRest("chat_channel_members", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(selectedIds.map((authUserId) => ({
            family_id: membership.family_id,
            channel_id: channel.id,
            auth_user_id: authUserId,
            role: authUserId === user.userId ? "owner" : "member",
          }))),
        });
      }
      await supabaseRest("audit_logs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          family_id: membership.family_id,
          actor_user_id: user.userId,
          action: "chat_channel_created",
          entity_type: "chat_channel",
          entity_id: channel.id,
          metadata: { channel_type: channelType, visibility },
        }),
      });
      return Response.json({ channelId: channel.id }, { status: 201 });
    }

    const channelId = uuidValue(body.channelId);
    if (!channelId) return Response.json({ error: "Channel নির্বাচন করুন।" }, { status: 400 });
    const channel = await getAccessibleChatChannel(membership, user.userId, channelId);
    if (!channel) return Response.json({ error: "Channel পাওয়া যায়নি।" }, { status: 404 });

    if (action === "send_message") {
      const messageBody = textValue(body.body, 5000);
      if (!messageBody) return Response.json({ error: "Message লিখুন।" }, { status: 400 });
      const replyToId = uuidValue(body.replyToId);
      if (body.replyToId && !replyToId) return Response.json({ error: "Reply message সঠিক নয়।" }, { status: 400 });
      if (replyToId) {
        const replyQuery = new URLSearchParams({
          select: "id",
          id: `eq.${replyToId}`,
          family_id: `eq.${membership.family_id}`,
          channel_id: `eq.${channel.id}`,
          limit: "1",
        });
        if (!(await supabaseRest<Array<{ id: string }>>(`chat_messages?${replyQuery}`)).length) {
          return Response.json({ error: "Reply message এই channel-এ নেই।" }, { status: 400 });
        }
      }
      const [message] = await supabaseRest<ChatMessageRow[]>("chat_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          family_id: membership.family_id,
          channel_id: channel.id,
          auth_user_id: user.userId,
          author_name: await getChatAuthorName(membership.family_id, user),
          message_type: "text",
          body: messageBody,
          reply_to_id: replyToId,
        }),
      });
      await supabaseRest(
        `chat_channels?id=eq.${channel.id}&family_id=eq.${membership.family_id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ updated_at: new Date().toISOString() }),
        },
      );
      return Response.json({ message: { ...message, is_mine: true } }, { status: 201 });
    }

    if (action === "toggle_reaction") {
      const messageId = uuidValue(body.messageId);
      const emoji = textValue(body.emoji, 16);
      if (!messageId || !emoji || !["❤️", "👍", "😂", "🤲", "🎉"].includes(emoji)) {
        return Response.json({ error: "Reaction সঠিক নয়।" }, { status: 400 });
      }
      const messageQuery = new URLSearchParams({
        select: "id",
        id: `eq.${messageId}`,
        family_id: `eq.${membership.family_id}`,
        channel_id: `eq.${channel.id}`,
        limit: "1",
      });
      if (!(await supabaseRest<Array<{ id: string }>>(`chat_messages?${messageQuery}`)).length) {
        return Response.json({ error: "Message পাওয়া যায়নি।" }, { status: 404 });
      }
      const reactionQuery = new URLSearchParams({
        select: "id",
        family_id: `eq.${membership.family_id}`,
        message_id: `eq.${messageId}`,
        auth_user_id: `eq.${user.userId}`,
        emoji: `eq.${emoji}`,
        limit: "1",
      });
      const existing = (await supabaseRest<Array<{ id: string }>>(`chat_message_reactions?${reactionQuery}`))[0];
      if (existing) {
        await supabaseRest(`chat_message_reactions?id=eq.${existing.id}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        });
        return Response.json({ active: false });
      }
      await supabaseRest("chat_message_reactions", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          family_id: membership.family_id,
          message_id: messageId,
          auth_user_id: user.userId,
          emoji,
        }),
      });
      return Response.json({ active: true }, { status: 201 });
    }

    if (action === "mark_read") {
      const lastReadMessageId = uuidValue(body.lastReadMessageId);
      if (!lastReadMessageId) return Response.json({ error: "Last message id প্রয়োজন।" }, { status: 400 });
      const messageQuery = new URLSearchParams({
        select: "id",
        id: `eq.${lastReadMessageId}`,
        family_id: `eq.${membership.family_id}`,
        channel_id: `eq.${channel.id}`,
        limit: "1",
      });
      if (!(await supabaseRest<Array<{ id: string }>>(`chat_messages?${messageQuery}`)).length) {
        return Response.json({ error: "Last message পাওয়া যায়নি।" }, { status: 400 });
      }
      const now = new Date().toISOString();
      await supabaseRest("chat_read_receipts?on_conflict=channel_id,auth_user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          family_id: membership.family_id,
          channel_id: channel.id,
          auth_user_id: user.userId,
          last_read_message_id: lastReadMessageId,
          last_read_at: now,
          updated_at: now,
        }),
      });
      return Response.json({ read: true });
    }

    if (action === "update_notification") {
      const level = textValue(body.level, 20);
      if (!level || !["all", "mentions", "muted"].includes(level)) {
        return Response.json({ error: "Notification preference সঠিক নয়।" }, { status: 400 });
      }
      const memberQuery = new URLSearchParams({
        select: "id",
        family_id: `eq.${membership.family_id}`,
        channel_id: `eq.${channel.id}`,
        auth_user_id: `eq.${user.userId}`,
        limit: "1",
      });
      const existing = (await supabaseRest<Array<{ id: string }>>(`chat_channel_members?${memberQuery}`))[0];
      if (existing) {
        await supabaseRest(`chat_channel_members?id=eq.${existing.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ notification_level: level, updated_at: new Date().toISOString() }),
        });
      } else {
        await supabaseRest("chat_channel_members", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            family_id: membership.family_id,
            channel_id: channel.id,
            auth_user_id: user.userId,
            role: "member",
            notification_level: level,
          }),
        });
      }
      return Response.json({ notificationLevel: level });
    }

    return Response.json({ error: "Unsupported chat action." }, { status: 400 });
  } catch (error) {
    if (createdChannelId) {
      try {
        await supabaseRest(`chat_channels?id=eq.${createdChannelId}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        });
      } catch {
        // Best-effort rollback for a channel whose member setup failed.
      }
    }
    return chatErrorResponse(error, "Unable to update family chat");
  }
}
