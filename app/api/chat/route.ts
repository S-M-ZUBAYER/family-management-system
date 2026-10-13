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
import { ChatSetupError,chatCreateInput,chatCreateWrite,chatPreferenceInput,chatPreferenceWrite,chatSetupResponse,chatSetupCopy } from "@/lib/chat-setup-workflow";

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
      select: "id,channel_id,auth_user_id,role,notification_level,status,updated_at",
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
        ownPreference: ownChannelMembership?{membershipId:ownChannelMembership.id,updatedAt:ownChannelMembership.updated_at}:null,
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
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const parsed:unknown = await request.json().catch(()=>{throw new ChatFlowError("CHAT_FLOW_REJECTED");});
    if(!noticeObject(parsed))throw new ChatFlowError("CHAT_FLOW_REJECTED");
    const body=parsed;
    const action = textValue(body.action, 40);
    const sendInput=action==="send_message"?chatSendInput(body):null;
    const reactionInput=action==="toggle_reaction"?chatReactionInput(body):null;
    const createInput=action==="create_channel"?chatCreateInput(body):null;
    const preferenceInput=action==="update_notification"?chatPreferenceInput(body):null;

    if (createInput) {
      if(createInput.channelType!=="direct"&&!canManageChat(membership.role))return Response.json({code:"CHAT_SETUP_REJECTED"},{status:403});
      const members=await getSafeFamilyMembers(membership.family_id,user),activeIds=new Set(members.map(m=>m.authUserId));
      if(createInput.memberIds.some(id=>!activeIds.has(id)))throw new ChatSetupError("CHAT_CHANNEL_INPUT");
      const targets=createInput.memberIds.filter(id=>id!==user.userId);
      if(createInput.channelType==="direct"&&targets.length!==1)throw new ChatSetupError("CHAT_CHANNEL_INPUT");
      const memberIds=createInput.visibility==="invite_only"?[...new Set([user.userId,...createInput.memberIds])].sort():[];
      const directKey=createInput.channelType==="direct"?memberIds.join(":"):null;
      const name=createInput.channelType==="direct"?("Direct · "+members.find(m=>m.authUserId===targets[0])!.name).slice(0,100):createInput.name;
      const description=createInput.channelType==="direct"?"ব্যক্তিগত কথোপকথন":createInput.description;
      const id=createInput.clientChannelId??crypto.randomUUID(),select="id,family_id,name,description,channel_type,visibility,direct_key,status,created_by_user_id,created_at,updated_at";
      const query=new URLSearchParams({select,family_id:`eq.${membership.family_id}`,...(directKey?{direct_key:`eq.${directKey}`,status:"eq.active"}:{id:`eq.${id}`,created_by_user_id:`eq.${user.userId}`}),limit:"2"});
      const memberQuery=(channelId:string)=>new URLSearchParams({select:"id,family_id,channel_id,auth_user_id,role,notification_level,status,created_at,updated_at",family_id:`eq.${membership.family_id}`,channel_id:`eq.${channelId}`,status:"eq.active"});
      const result=await chatCreateWrite({id,familyId:membership.family_id,actorId:user.userId,name,description,channelType:createInput.channelType,visibility:createInput.visibility,directKey,memberIds,
        readExisting:()=>supabaseRest(`chat_channels?${query}`),
        write:()=>supabaseRest("chat_channels",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id,family_id:membership.family_id,name,description,channel_type:createInput.channelType,visibility:createInput.visibility,direct_key:directKey,created_by_user_id:user.userId})}),
        readMembers:channelId=>supabaseRest(`chat_channel_members?${memberQuery(channelId)}`),
        writeMembers:channelId=>supabaseRest("chat_channel_members",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(memberIds.map(authUserId=>({id:crypto.randomUUID(),family_id:membership.family_id,channel_id:channelId,auth_user_id:authUserId,role:authUserId===user.userId?"owner":"member",notification_level:"all",status:"active"})))}),
        collision:e=>e instanceof SupabaseRequestError&&e.status===409,
        rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
        audit:channelId=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:"chat_channel_created",entity_type:"chat_channel",entity_id:channelId,metadata:{channel_type:createInput.channelType,visibility:createInput.visibility}})}),
      });return chatSetupResponse(result);
    }

    const channelId = sendInput?.channelId??reactionInput?.channelId??preferenceInput?.channelId??uuidValue(body.channelId);
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

    if (preferenceInput) {
      const query=new URLSearchParams({select:"id,family_id,channel_id,auth_user_id,role,notification_level,status,created_at,updated_at",family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,auth_user_id:`eq.${user.userId}`,limit:"2"});
      const existing=await supabaseRest<unknown>(`chat_channel_members?${query}`),newId=crypto.randomUUID();
      const result=await chatPreferenceWrite({familyId:membership.family_id,actorId:user.userId,input:preferenceInput,existing,newId,
        rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
        write:(row,updatedAt)=>row?supabaseRest(`chat_channel_members?${new URLSearchParams({id:`eq.${row.id}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,auth_user_id:`eq.${user.userId}`,status:"eq.active",notification_level:`eq.${row.notification_level}`,updated_at:`eq.${row.updated_at}`})}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({notification_level:preferenceInput.level,updated_at:updatedAt})})
          :supabaseRest("chat_channel_members",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id:newId,family_id:membership.family_id,channel_id:channel.id,auth_user_id:user.userId,role:"member",status:"active",notification_level:preferenceInput.level,updated_at:updatedAt})}),
        audit:()=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:"chat_notification_changed",entity_type:"chat_channel",entity_id:channel.id,metadata:{notification_level:preferenceInput.level}})}),
      });return chatSetupResponse(result);
    }

    return Response.json({ error: "Unsupported chat action." }, { status: 400 });
  } catch (error) {
    if(error instanceof ChatSetupError)return Response.json({code:error.code,error:chatSetupCopy(error.code,"en"),...(["CHAT_SETUP_UNKNOWN","CHAT_CHANNEL_SETUP_PENDING"].includes(error.code)?{outcomeUnknown:true}:{}),...(error.channelId?{channelId:error.channelId}:{})},{status:error.status});
    if(error instanceof ChatFlowError)return Response.json({code:error.code,error:chatFlowCopy(error.code,"en"),...(error.code==="CHAT_FLOW_UNKNOWN"?{outcomeUnknown:true}:{})},{status:error.status});

    return chatErrorResponse(error, "Unable to update family chat");
  }
}
