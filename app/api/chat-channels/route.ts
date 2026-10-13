import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership, canManageChat } from "@/lib/family-access";
import { getManagedChatChannels } from "@/lib/chat-channel-management-server";
import { managedChannelPublic, chatLifecycleCopy } from "@/lib/chat-channel-lifecycle";
export async function GET() {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ code: "CHAT_CHANNEL_FORBIDDEN" }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageChat(membership.role)) return Response.json({ code: "CHAT_CHANNEL_FORBIDDEN" }, { status: 403 });
    const channels = await getManagedChatChannels(membership, user.userId);
    return Response.json({ familyId: membership.family_id, actorId: user.userId, channels: channels.map(managedChannelPublic) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ code: "CHAT_CHANNEL_LOAD", error: chatLifecycleCopy("CHAT_CHANNEL_LOAD", "en") }, { status: 503 }); }
}
