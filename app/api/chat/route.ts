import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canAccessChatChannel } from "@/lib/chat-access-policy";
import { countUnreadChatMessages } from "@/lib/chat-unread-counts";
import { parseChatCursor } from "@/lib/chat-cursor";
import {
  canManageChat,
  getActiveFamilyMembership,
  type FamilyRole,
} from "@/lib/family-access";
import {
  chatErrorResponse,
  getChatAuthorName,
  getAccessibleChatChannel,
  loadChatExport,
  loadChatMessages,
  type ChatChannelMemberRow,
  type ChatChannelRow,
} from "@/lib/family-chat";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseExactCount,
  supabaseRest,
} from "@/lib/supabase-rest";
import { readAllSupabaseRows } from "@/lib/supabase-pagination";
import { noticeObject, noticeUuid } from "@/lib/notice-validation";
import { ChatFlowError,chatSendInput,chatReactionInput,chatSendWrite,chatReactionWrite,chatFlowResponse,chatFlowCopy } from "@/lib/chat-send-reaction";

type SafeMember = {
  authUserId: string;
  name: string;
  initials: string;
  role: FamilyRole;
};

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const uuidValue = (value: unknown) => {
  return noticeUuid(value) ? value.toLowerCase() : null;
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
    select: "id,auth_user_id,member_profile_id,role",
    family_id: `eq.${familyId}`,
    status: "eq.active",
    order: "created_at.asc,id.asc",
  });
  const profileQuery = new URLSearchParams({
    select: "id,auth_user_id,name_bn,name_en",
    family_id: `eq.${familyId}`,
    auth_user_id: "not.is.null",
    profile_status: "eq.active",
    order: "id.asc",
  });
  const [memberships, profiles] = await Promise.all([
    readAllSupabaseRows<{ auth_user_id: string; member_profile_id: string | null; role: FamilyRole }>(
      "family_memberships", membershipQuery,
    ),
    readAllSupabaseRows<{ auth_user_id: string; name_bn: string; name_en: string | null }>(
      "member_profiles", profileQuery,
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
    const after = textValue(url.searchParams.get("after"), 100);
    if (url.searchParams.has("after") && !parseChatCursor(after)) {
      return Response.json({ error: "Chat cursor সঠিক নয়।" }, { status: 400 });
    }
    if (url.searchParams.has("channelId") && !channelId) {
      return Response.json({ error: "Channel id সঠিক নয়।" }, { status: 400 });
    }
    if (channelId) {
      const channel = await getAccessibleChatChannel(membership, user.userId, channelId);
      if (!channel) return Response.json({ error: "Channel পাওয়া যায়নি।" }, { status: 404 });
      const feed = url.searchParams.get("export") === "1"
        ? await loadChatExport(membership, user, channel.id)
        : await loadChatMessages(membership, user, channel.id, after);
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
      order: "updated_at.desc,id.asc",
    });
    const channelMemberQuery = new URLSearchParams({
      select: "id,channel_id,auth_user_id,role,notification_level,status",
      family_id: `eq.${membership.family_id}`,
      status: "eq.active",
      order: "id.asc",
    });
    const receiptQuery = new URLSearchParams({
      select: "channel_id,last_read_at,last_read_message_id",
      family_id: `eq.${membership.family_id}`,
      auth_user_id: `eq.${user.userId}`,
      order: "id.asc",
    });

    let migrationRequired = false;
    let channels: ChatChannelRow[] = [];
    let channelMembers: ChatChannelMemberRow[] = [];
    let receipts: Array<{ channel_id: string; last_read_at: string; last_read_message_id: string | null }> = [];
    const [family, members] = await Promise.all([
      supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${familyQuery}`),
      getSafeFamilyMembers(membership.family_id, user),
    ]);
    try {
      [channels, channelMembers, receipts] = await Promise.all([
        readAllSupabaseRows<ChatChannelRow>("chat_channels", channelQuery),
        readAllSupabaseRows<ChatChannelMemberRow>("chat_channel_members", channelMemberQuery),
        readAllSupabaseRows<(typeof receipts)[number]>("chat_read_receipts", receiptQuery),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true;
      else throw error;
    }

    const memberChannelIds = new Set(
      channelMembers
        .filter((item) => item.auth_user_id === user.userId)
        .map((item) => item.channel_id),
    );
    const accessible = channels.filter((channel) =>
      canAccessChatChannel(channel.visibility, membership.role, memberChannelIds.has(channel.id)),
    );
    const receiptsByChannel = new Map(receipts.map((receipt) => [receipt.channel_id, receipt]));
    const membersById = new Map(members.map((member) => [member.authUserId, member]));

    const unreadCounts = migrationRequired ? new Map<string, number>() : await countUnreadChatMessages(
      accessible, receiptsByChannel, membership.family_id, user.userId, supabaseExactCount,
    );

    const safeChannels = accessible.map((channel) => {
      const explicitMembers = channelMembers.filter((item) => item.channel_id === channel.id);
      const unreadCount = unreadCounts.get(channel.id) ?? 0;
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
  let rollbackFamilyId: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    rollbackFamilyId = membership.family_id;
    const parsed:unknown = await request.json().catch(()=>{throw new ChatFlowError("CHAT_FLOW_REJECTED");});
    if(!noticeObject(parsed))throw new ChatFlowError("CHAT_FLOW_REJECTED");
    const body=parsed;
    const action = textValue(body.action, 40);
    const sendInput=action==="send_message"?chatSendInput(body):null;
    const reactionInput=action==="toggle_reaction"?chatReactionInput(body):null;

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

    const channelId = sendInput?.channelId??reactionInput?.channelId??uuidValue(body.channelId);
    if (!channelId) return Response.json({ error: "Channel নির্বাচন করুন।" }, { status: 400 });
    const channel = await getAccessibleChatChannel(membership, user.userId, channelId);
    if (!channel) return Response.json({ error: "Channel পাওয়া যায়নি।" }, { status: 404 });

    if (sendInput) {
      if(sendInput.replyToId){
        const query=new URLSearchParams({select:"id",id:`eq.${sendInput.replyToId}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,limit:"1"});
        const replies=await supabaseRest<Array<{id:string}>>(`chat_messages?${query}`);
        if(replies.length!==1||replies[0].id!==sendInput.replyToId)throw new ChatFlowError("CHAT_SEND_INPUT");
      }
      const id=sendInput.clientMessageId??crypto.randomUUID(),authorName=await getChatAuthorName(membership.family_id,user);
      const query=new URLSearchParams({select:"id,family_id,channel_id,auth_user_id,author_name,message_type,body,reply_to_id,edited_at,created_at",id:`eq.${id}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,auth_user_id:`eq.${user.userId}`,message_type:"eq.text",limit:"1"});
      const result=await chatSendWrite({familyId:membership.family_id,channelId:channel.id,actorId:user.userId,id,authorName,input:sendInput,
        readExisting:()=>supabaseRest(`chat_messages?${query}`),
        write:()=>supabaseRest("chat_messages",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id,family_id:membership.family_id,channel_id:channel.id,auth_user_id:user.userId,author_name:authorName,message_type:"text",body:sendInput.body,reply_to_id:sendInput.replyToId})}),
        rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
        collision:e=>e instanceof SupabaseRequestError&&e.status===409,
        sync:()=>supabaseRest(`chat_channels?id=eq.${channel.id}&family_id=eq.${membership.family_id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({updated_at:new Date().toISOString()})}),
        audit:()=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:"chat_message_sent",entity_type:"chat_message",entity_id:id,metadata:{channel_id:channel.id}})}),
      });return chatFlowResponse(result);
    }

    if (reactionInput) {
      const query=new URLSearchParams({select:"id",id:`eq.${reactionInput.messageId}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,limit:"1"});
      const messages=await supabaseRest<Array<{id:string}>>(`chat_messages?${query}`);
      if(messages.length!==1||messages[0].id!==reactionInput.messageId)return Response.json({code:"CHAT_FLOW_REJECTED",error:"Message not found."},{status:404});
      const reactionQuery=new URLSearchParams({select:"id,family_id,message_id,auth_user_id,emoji,created_at",family_id:`eq.${membership.family_id}`,message_id:`eq.${reactionInput.messageId}`,auth_user_id:`eq.${user.userId}`,emoji:`eq.${reactionInput.emoji}`,limit:"2"});
      const existing=await supabaseRest<unknown>(`chat_message_reactions?${reactionQuery}`),newId=crypto.randomUUID();
      const result=await chatReactionWrite({familyId:membership.family_id,channelId:channel.id,actorId:user.userId,input:reactionInput,existing,newId,
        rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
        write:row=>row?supabaseRest(`chat_message_reactions?${new URLSearchParams({id:`eq.${row.id}`,family_id:`eq.${membership.family_id}`,message_id:`eq.${reactionInput.messageId}`,auth_user_id:`eq.${user.userId}`,emoji:`eq.${reactionInput.emoji}`,created_at:`eq.${row.created_at}`})}`,{method:"DELETE",headers:{Prefer:"return=representation"}})
          :supabaseRest("chat_message_reactions",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id:newId,family_id:membership.family_id,message_id:reactionInput.messageId,auth_user_id:user.userId,emoji:reactionInput.emoji})}),
        audit:()=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:reactionInput.active?"chat_reaction_added":"chat_reaction_removed",entity_type:"chat_reaction",entity_id:reactionInput.expectedReactionId??newId,metadata:{channel_id:channel.id,message_id:reactionInput.messageId,emoji:reactionInput.emoji}})}),
      });return chatFlowResponse(result);
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
        await supabaseRest(`chat_channel_members?id=eq.${existing.id}&family_id=eq.${membership.family_id}`, {
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
    if(error instanceof ChatFlowError)return Response.json({code:error.code,error:chatFlowCopy(error.code,"en"),...(error.code==="CHAT_FLOW_UNKNOWN"?{outcomeUnknown:true}:{})},{status:error.status});
    if (createdChannelId && rollbackFamilyId) {
      try {
        await supabaseRest(`chat_channels?id=eq.${createdChannelId}&family_id=eq.${rollbackFamilyId}`, {
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
