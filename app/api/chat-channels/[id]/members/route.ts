import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { getOwnedPrivateChat, getChatMemberSnapshot, chatMemberColumns } from "@/lib/chat-membership-server";
import { ChatMembershipError, chatMembershipInput, chatMembershipWrite, chatMembershipCopy, chatMembershipSnapshot } from "@/lib/chat-membership-workflow";
import { noticeUuid, noticeObject } from "@/lib/notice-validation";
import { supabaseRest, SupabaseRequestError } from "@/lib/supabase-rest";
type Context = { params: Promise<{ id: string }> };
function failure(e: unknown) { const known = e instanceof ChatMembershipError, code = known ? e.code : "CHAT_MEMBER_UNKNOWN"; return Response.json({ code, error: chatMembershipCopy(code, "en"), ...(code === "CHAT_MEMBER_UNKNOWN" ? { outcomeUnknown: true } : {}) }, { status: known ? e.status : 503, headers: { "Cache-Control": "no-store" } }); }
async function identity(context: Context) {
  const user = await getChatGPTUser(); if (!user) throw new ChatMembershipError("CHAT_MEMBER_FORBIDDEN", 401);
  const membership = await getActiveFamilyMembership(user.userId); if (!membership) throw new ChatMembershipError("CHAT_MEMBER_FORBIDDEN", 403);
  const { id } = await context.params; if (!noticeUuid(id)) throw new ChatMembershipError("CHAT_MEMBER_INVALID");
  return { user, membership, id: id.toLowerCase() };
}
export async function GET(_request: Request, context: Context) {
  try { const { user, membership, id } = await identity(context); const p = await getChatMemberSnapshot(membership, user.userId, id); if (!chatMembershipSnapshot(p)) throw new ChatMembershipError("CHAT_MEMBER_LOAD", 503); const current=await getActiveFamilyMembership(user.userId);if(!current||current.family_id!==membership.family_id)throw new ChatMembershipError("CHAT_MEMBER_FORBIDDEN",403);await getOwnedPrivateChat(current,user.userId,id);return Response.json(p, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return failure(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { user, membership, id } = await identity(context);
    const input = chatMembershipInput(await request.json().catch(() => { throw new ChatMembershipError("CHAT_MEMBER_INVALID"); }));
    if (input.expectedFamilyId !== membership.family_id || input.expectedActorId !== user.userId) throw new ChatMembershipError("CHAT_MEMBER_CHANGED", 409);
    const channel = await getOwnedPrivateChat(membership, user.userId, id);
    if (channel.updated_at !== input.expectedChannelUpdatedAt) throw new ChatMembershipError("CHAT_MEMBER_CHANGED", 409);
    const q = new URLSearchParams({ select: chatMemberColumns, family_id: `eq.${membership.family_id}`, channel_id: `eq.${id}`, auth_user_id: `eq.${input.targetUserId}`, limit: "2" });
    const rows = await supabaseRest<unknown>(`chat_channel_members?${q}`);
    if (!Array.isArray(rows) || rows.length > 1 || rows.length && !noticeObject(rows[0])) throw new ChatMembershipError("CHAT_MEMBER_UNKNOWN", 503);
    const row = (rows[0] ?? null) as Record<string, unknown> | null;
    const accounts = await supabaseRest<unknown>(`family_memberships?${new URLSearchParams({ select: "auth_user_id", family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${input.targetUserId}`, status: "eq.active", limit: "2" })}`);
    if (!Array.isArray(accounts) || accounts.length > 1 || accounts.some(a => !noticeObject(a) || a.auth_user_id !== input.targetUserId)) throw new ChatMembershipError("CHAT_MEMBER_UNKNOWN", 503);
    const targetActive = accounts.length === 1;
    const result = await chatMembershipWrite({ channelId: id, familyId: membership.family_id, actorId: user.userId, input, row, targetActive,
      write: (updatedAt, plan) => {
        if (!row) return supabaseRest("chat_channel_members", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: input.clientMembershipId, family_id: membership.family_id, channel_id: id, auth_user_id: input.targetUserId, role: "member", status: "active", notification_level: "all", created_at: updatedAt, updated_at: updatedAt }) });
        const target = new URLSearchParams({ select: chatMemberColumns, id: `eq.${row.id}`, family_id: `eq.${membership.family_id}`, channel_id: `eq.${id}`, auth_user_id: `eq.${input.targetUserId}`, role: `eq.${input.expectedRole}`, status: `eq.${input.expectedStatus}`, updated_at: `eq.${input.expectedUpdatedAt}`, notification_level: `eq.${row.notification_level}` });
        return supabaseRest(`chat_channel_members?${target}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ role: plan.role, status: plan.status, updated_at: updatedAt }) });
      },
      audit: () => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: `chat_member_${input.action}`, entity_type: "chat_channel", entity_id: id, metadata: { membership_id: row?.id ?? input.clientMembershipId, operation: input.action } }) }),
      rejected: e => e instanceof SupabaseRequestError && e.status >= 400 && e.status < 500 && e.status !== 408,
    });
    return Response.json({ ...result, ...(result.auditPending ? { code: "CHAT_MEMBER_AUDIT_PENDING" } : {}) }, { status: result.auditPending ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
