import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageWelfare, getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { canDeleteWelfareDocument, type WelfareDocumentEntityType } from "@/lib/welfare-document-policy";
import { welfareDocumentUuid } from "@/lib/welfare-document-upload";
import { welfareDocumentResultCopy } from "@/lib/welfare-document-action-copy";
import { canMemberSeeWelfareContribution, canMemberSeeWelfareDocument, canMemberSeeWelfareExpense, canMemberSeeWelfareRequest } from "@/lib/welfare-visibility";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const parentTables: Record<WelfareDocumentEntityType, string> = {
  fund: "welfare_funds",
  contribution: "welfare_contributions",
  expense: "welfare_expenses",
  request: "welfare_requests",
};

async function documentParentStatus(familyId: string, entityType: WelfareDocumentEntityType, entityId: string) {
  const query = new URLSearchParams({ select: "status", id: `eq.${entityId}`, family_id: `eq.${familyId}`, limit: "1" });
  const parent = (await supabaseRest<Array<{ status: string }>>(`${parentTables[entityType]}?${query}`))[0];
  return parent?.status ?? null;
}

async function isFamilyVisibleFund(familyId: string, fundId: string) {
  const query = new URLSearchParams({ select: "id", id: `eq.${fundId}`, family_id: `eq.${familyId}`, visibility: "eq.family", limit: "1" });
  return Boolean((await supabaseRest<Array<{ id: string }>>(`welfare_funds?${query}`))[0]);
}

async function canMemberSeeDocumentParent(familyId: string, entityType: WelfareDocumentEntityType, entityId: string, userId: string) {
  const query = new URLSearchParams({ id: `eq.${entityId}`, family_id: `eq.${familyId}`, limit: "1" });
  if (entityType === "fund") return isFamilyVisibleFund(familyId, entityId);
  if (entityType === "contribution") {
    query.set("select", "fund_id,contributor_user_id,status");
    const row = (await supabaseRest<Array<{ fund_id: string; contributor_user_id: string | null; status: string }>>(`welfare_contributions?${query}`))[0];
    if (!row) return false;
    if (row.contributor_user_id === userId) return true;
    const visibleFundIds = await isFamilyVisibleFund(familyId, row.fund_id) ? new Set([row.fund_id]) : new Set<string>();
    return canMemberSeeWelfareContribution(row, visibleFundIds, userId);
  }
  if (entityType === "expense") {
    query.set("select", "fund_id,status");
    const row = (await supabaseRest<Array<{ fund_id: string; status: string }>>(`welfare_expenses?${query}`))[0];
    if (!row) return false;
    const visibleFundIds = await isFamilyVisibleFund(familyId, row.fund_id) ? new Set([row.fund_id]) : new Set<string>();
    return canMemberSeeWelfareExpense(row, visibleFundIds);
  }
  if (entityType === "request") {
    query.set("select", "fund_id,requester_user_id,visibility,status");
    const row = (await supabaseRest<Array<{ fund_id: string | null; requester_user_id: string; visibility: string; status: string }>>(`welfare_requests?${query}`))[0];
    if (!row) return false;
    if (row.requester_user_id === userId) return true;
    const visibleFundIds = row.fund_id && await isFamilyVisibleFund(familyId, row.fund_id) ? new Set([row.fund_id]) : new Set<string>();
    return canMemberSeeWelfareRequest(row, visibleFundIds, userId);
  }
  return false;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return new Response("Sign in is required.", { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return new Response("Family membership required.", { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return new Response("Private storage unavailable.", { status: 503 });
    const { id } = await context.params;
    if (!welfareDocumentUuid(id)) return new Response("Invalid document ID.", { status: 400 });
    const query = new URLSearchParams({ select: "storage_key,mime_type,file_name,visibility,uploaded_by_user_id,entity_type,entity_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const document = (await supabaseRest<Array<{ storage_key: string; mime_type: string; file_name: string; visibility: string; uploaded_by_user_id: string; entity_type: WelfareDocumentEntityType; entity_id: string }>>(`welfare_documents?${query}`))[0];
    if (!document) return new Response("Document not found.", { status: 404 });
    if (!canManageWelfare(membership.role)) {
      const parentVisible = await canMemberSeeDocumentParent(membership.family_id, document.entity_type, document.entity_id, user.userId);
      if (!canMemberSeeWelfareDocument(document, parentVisible, user.userId)) return new Response("Not authorized.", { status: 403 });
    }
    const object = await bucket.get(document.storage_key);
    if (!object) return new Response("Document not found.", { status: 404 });
    const canInline = document.mime_type.startsWith("image/") || document.mime_type === "application/pdf";
    return new Response(object.body, { headers: { "Content-Type": document.mime_type, "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.file_name)}`, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", ETag: object.httpEtag } });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to load Welfare document", error.status, error.message);
    else console.error("Unable to load Welfare document", error);
    return new Response("Document unavailable.", { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Family membership required." }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return Response.json({ error: "Private storage unavailable." }, { status: 503 });
    const { id } = await context.params;
    if (!welfareDocumentUuid(id)) return Response.json({ code: "WELFARE_DOCUMENT_LINK_INVALID", error: "Invalid document ID." }, { status: 400 });
    const document = (await supabaseRest<Array<{ storage_key: string; uploaded_by_user_id: string; entity_type: WelfareDocumentEntityType; entity_id: string }>>(`welfare_documents?${new URLSearchParams({ select: "storage_key,uploaded_by_user_id,entity_type,entity_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!document) return Response.json({ code: "WELFARE_DOCUMENT_NOT_FOUND", error: "Document not found." }, { status: 404 });
    if (!canManageWelfare(membership.role) && document.uploaded_by_user_id !== user.userId) return Response.json({ code: "WELFARE_DOCUMENT_FORBIDDEN", error: "No permission to delete this document." }, { status: 403 });
    const parentStatus = await documentParentStatus(membership.family_id, document.entity_type, document.entity_id);
    if (!canDeleteWelfareDocument(document.entity_type, parentStatus)) return Response.json({ code: "WELFARE_DOCUMENT_FINALIZED", error: "Reviewed, closed, or paid Welfare evidence cannot be permanently deleted." }, { status: 409 });
    const deleted = await supabaseRest<Array<{ id: string }>>(`welfare_documents?${new URLSearchParams({ select: "id", id: `eq.${id}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!deleted.length) return Response.json({ code: "WELFARE_DOCUMENT_NOT_FOUND", error: "Document not found." }, { status: 404 });
    let cleanupPending = false;
    try { await bucket.delete(document.storage_key); }
    catch (error) { cleanupPending = true; console.error("Welfare document storage cleanup pending", id, error); }
    let auditPending = false;
    try {
      await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "welfare_document_deleted", entity_type: "welfare_documents", entity_id: id, metadata: { module: "welfare", cleanup_pending: cleanupPending, ...(cleanupPending ? { storage_key: document.storage_key } : {}) } }) });
    } catch (error) { auditPending = true; console.error("Welfare document removed; delete audit pending", id, error); }
    return Response.json({ message: welfareDocumentResultCopy(`/api/welfare-document/${id}`, { cleanupPending, auditPending }, "en") ?? "Document deleted.", cleanupPending, auditPending }, { status: cleanupPending || auditPending ? 202 : 200 });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend unavailable." }, { status: 503 });
    if (error instanceof SupabaseRequestError && /WELFARE_DOCUMENT_FINALIZED/.test(error.message)) return Response.json({ code: "WELFARE_DOCUMENT_FINALIZED", error: "Reviewed, closed, or paid Welfare evidence cannot be permanently deleted." }, { status: 409 });
    if (error instanceof SupabaseRequestError && /WELFARE_DOCUMENT_PARENT_MISSING/.test(error.message)) return Response.json({ code: "WELFARE_DOCUMENT_PARENT_MISSING", error: "The linked Welfare record no longer exists." }, { status: 409 });
    if (error instanceof SupabaseRequestError) console.error("Unable to delete Welfare document", error.status, error.message); else console.error("Unable to delete Welfare document", error);
    return Response.json({ error: "Document delete হয়নি।" }, { status: 500 });
  }
}
