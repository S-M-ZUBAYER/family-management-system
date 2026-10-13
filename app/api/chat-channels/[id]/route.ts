import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership, canManageChat } from "@/lib/family-access";
import { getManagedChatChannels, chatChannelColumns } from "@/lib/chat-channel-management-server";
import { chatLifecycleInput, chatLifecycleWrite, ChatChannelError, chatLifecycleCopy } from "@/lib/chat-channel-lifecycle";
import { noticeUuid } from "@/lib/notice-validation";
import { SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) throw new ChatChannelError("CHAT_CHANNEL_FORBIDDEN", 401);
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageChat(membership.role)) throw new ChatChannelError("CHAT_CHANNEL_FORBIDDEN", 403);
    const { id } = await context.params; if (!noticeUuid(id)) throw new ChatChannelError("CHAT_CHANNEL_INVALID");
    const input = chatLifecycleInput(await request.json().catch(() => { throw new ChatChannelError("CHAT_CHANNEL_INVALID"); }));
    if (input.expectedFamilyId !== membership.family_id) throw new ChatChannelError("CHAT_CHANNEL_CHANGED", 409);
    const row = (await getManagedChatChannels(membership, user.userId, id.toLowerCase()))[0];
    if (!row) throw new ChatChannelError("CHAT_CHANNEL_NOT_FOUND", 404);
    const q = new URLSearchParams({ select: chatChannelColumns, id: `eq.${row.id}`, family_id: `eq.${membership.family_id}`, channel_type: `eq.${row.channel_type}`, visibility: `eq.${row.visibility}`, created_by_user_id: `eq.${row.created_by_user_id}`, status: `eq.${input.expectedStatus}`, updated_at: `eq.${input.expectedUpdatedAt}`, name: `eq.${input.expectedName}`, description: input.expectedDescription === null ? "is.null" : `eq.${input.expectedDescription}` });
    const result = await chatLifecycleWrite({ row, input,
      write: updatedAt => supabaseRest(`chat_channels?${q}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: input.name, description: input.description, status: input.status, updated_at: updatedAt }) }),
      audit: () => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: `chat_channel_${input.action === "edit" ? "edited" : input.action === "archive" ? "archived" : "restored"}`, entity_type: "chat_channel", entity_id: row.id, metadata: { channel_type: row.channel_type, visibility: row.visibility } }) }),
      rejected: e => e instanceof SupabaseRequestError && e.status >= 400 && e.status < 500 && e.status !== 408,
    });
    return Response.json({ ...result, ...(result.auditPending ? { code: "CHAT_CHANNEL_AUDIT_PENDING" } : {}) }, { status: result.auditPending ? 202 : 200 });
  } catch (e) {
    const known = e instanceof ChatChannelError; const code = known ? e.code : "CHAT_CHANNEL_UNKNOWN";
    return Response.json({ code, error: chatLifecycleCopy(code, "en"), ...(code === "CHAT_CHANNEL_UNKNOWN" ? { outcomeUnknown: true } : {}) }, { status: known ? e.status : 503 });
  }
}
