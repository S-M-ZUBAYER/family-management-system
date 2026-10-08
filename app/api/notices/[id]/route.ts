import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageNotices, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { NoticeValidationError, noticeObject, noticeUuid, noticeRecord, noticeStatusPatch } from "@/lib/notice-validation";
import { noticeErrorResponse, type FamilyNoticeRow } from "../route";

type Context = { params: Promise<{ id: string }> };
const actions = ["publish", "draft", "archive", "pin", "unpin", "edit"];
function scopedQuery(id: string, familyId: string, existing?: FamilyNoticeRow) {
  return new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${familyId}`,
    ...(existing ? { updated_at: `eq.${existing.updated_at}`, status: `eq.${existing.status}` } : {}) });
}
async function audit(familyId: string, actor: string, id: string, action: string, metadata: Record<string, unknown> = {}) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    family_id: familyId, actor_user_id: actor, action, entity_type: "family_notice", entity_id: id, metadata,
  }) });
}
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageNotices(membership.role)) return Response.json({ error: "Notice পরিচালনার permission নেই।" }, { status: 403 });
    const { id } = await context.params;
    if (!noticeUuid(id)) throw new NoticeValidationError("NOTICE_INVALID_ID");
    const body: unknown = await request.json().catch(() => { throw new NoticeValidationError("NOTICE_INVALID_BODY"); });
    if (!noticeObject(body)) throw new NoticeValidationError("NOTICE_INVALID_BODY");
    if (typeof body.action !== "string" || !actions.includes(body.action)) throw new NoticeValidationError("NOTICE_INVALID_ACTION");
    const [existing] = await supabaseRest<FamilyNoticeRow[]>(`family_notices?${scopedQuery(id, membership.family_id)}&limit=1`);
    if (!existing) return Response.json({ error: "Notice পাওয়া যায়নি।" }, { status: 404 });
    const now = new Date().toISOString();
    const patch = body.action === "edit" ? noticeRecord(body.data, true, now) : noticeStatusPatch(body.action, existing.expires_at, now);
    const [notice] = await supabaseRest<FamilyNoticeRow[]>(`family_notices?${scopedQuery(id, membership.family_id, existing)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: now }),
    });
    if (!notice) throw new NoticeValidationError("NOTICE_RECORD_CHANGED");
    await audit(membership.family_id, user.userId, id, body.action === "edit" ? "family_notice_updated" : `family_notice_${body.action}`);
    return Response.json({ notice, message: body.action === "edit" ? "Notice details update হয়েছে।" : "Notice status update হয়েছে।" });
  } catch (error) { return noticeErrorResponse(error, "Unable to update notice"); }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageNotices(membership.role)) return Response.json({ error: "Notice delete করার permission নেই।" }, { status: 403 });
    const { id } = await context.params;
    if (!noticeUuid(id)) throw new NoticeValidationError("NOTICE_INVALID_ID");
    const [existing] = await supabaseRest<FamilyNoticeRow[]>(`family_notices?${scopedQuery(id, membership.family_id)}&limit=1`);
    if (!existing) return Response.json({ error: "Notice পাওয়া যায়নি।" }, { status: 404 });
    const removed = await supabaseRest<Array<{ id: string }>>(`family_notices?${scopedQuery(id, membership.family_id, existing)}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (removed.length !== 1 || removed[0].id !== id) throw new NoticeValidationError("NOTICE_RECORD_CHANGED");
    await audit(membership.family_id, user.userId, id, "family_notice_deleted", { title: existing.title_bn });
    return Response.json({ message: "Notice স্থায়ীভাবে delete হয়েছে।" });
  } catch (error) { return noticeErrorResponse(error, "Unable to delete notice"); }
}
