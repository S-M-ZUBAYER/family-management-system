import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { HealthDocumentError, healthDocumentCopy, healthDocumentDeleteInput, healthDocumentPublic, healthDocumentKey, deleteHealthDocument } from "@/lib/health-document-workflow";
import { healthUuid } from "@/lib/health-validation";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return new Response("Sign in is required.", { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return new Response("Family membership required.", { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return new Response("Private storage unavailable.", { status: 503 });
    const { id } = await context.params;
    if (!healthUuid(id)) return new Response("Invalid document ID.", { status: 400 });
    const query = new URLSearchParams({ select: "*", id: "eq." + id, family_id: "eq." + membership.family_id, auth_user_id: "eq." + user.userId, limit: "1" });
    const document = (await supabaseRest<Array<Record<string, unknown>>>("health_documents?" + query))[0];
    const scope = { familyId: membership.family_id, actorId: user.userId };
    const publicRow = healthDocumentPublic(document);
    if (!document || !publicRow || publicRow.id!==id || document.family_id !== membership.family_id || document.auth_user_id !== user.userId || !healthDocumentKey(document.storage_key, scope)) return new Response("Document not found.", { status: 404 });
    const object = await bucket.get(document.storage_key as string);
    if (!object || object.size !== publicRow.file_size || object.httpMetadata?.contentType !== publicRow.mime_type) return new Response("Document unavailable.", { status: 404 });
    // Re-read after object lookup: an already-deleted or changed row must not be served.
    const latest = (await supabaseRest<Array<Record<string, unknown>>>("health_documents?" + query))[0];
    if (!latest || latest.family_id!==membership.family_id || latest.auth_user_id!==user.userId || latest.storage_key !== document.storage_key || JSON.stringify(healthDocumentPublic(latest)) !== JSON.stringify(publicRow)) return new Response("Document changed.", { status: 409 });
    const current = await getActiveFamilyMembership(user.userId);
    if (!current || current.family_id !== membership.family_id || current.role !== membership.role) return new Response("Health context changed.", { status: 409 });
    const canInline = publicRow.mime_type.startsWith("image/") || publicRow.mime_type === "application/pdf";
    return new Response(object.body, { headers: {
      "Content-Type": publicRow.mime_type,
      "Content-Disposition": (canInline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(publicRow.file_name),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ETag: object.httpEtag,
    } });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 });
    console.error("Health document read failed.");
    return new Response("Document unavailable.", { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Family membership required." }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) throw new HealthDocumentError("HEALTH_DOC_STORAGE", 503);
    const { id } = await context.params;
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new HealthDocumentError("HEALTH_DOC_INPUT"); }
    const input = healthDocumentDeleteInput(raw, id, { familyId: membership.family_id, actorId: user.userId });
    const query = new URLSearchParams({ select: "*", id: "eq." + id, family_id: "eq." + membership.family_id, auth_user_id: "eq." + user.userId, limit: "1" });
    const document = (await supabaseRest<Array<Record<string, unknown>>>("health_documents?" + query))[0];
    if (!document) return Response.json({ code: "HEALTH_DOC_CHANGED" }, { status: 404 });
    const current = await getActiveFamilyMembership(user.userId);
    if (!current || current.family_id !== membership.family_id || current.role !== membership.role) throw new HealthDocumentError("HEALTH_DOC_CONTEXT", 409);
    const result = await deleteHealthDocument({
      id, scope: input.scope, expected: input.document, existing: document,
      removeRecord: q => supabaseRest("health_documents?" + q, { method: "DELETE", headers: { Prefer: "return=representation" } }),
      removeUnreferencedObject: async key => {
        const refs = await supabaseRest<unknown[]>("health_documents?" + new URLSearchParams({ select: "id", storage_key: "eq." + key, limit: "1" }));
        if (!Array.isArray(refs) || refs.length) throw new Error("Object reference needs reconciliation.");
        await bucket.delete(key);
      },
      rejected: e => e instanceof SupabaseRequestError && e.status >= 400 && e.status < 500 && e.status !== 408,
      audit: async cleanupPending => {
        const rows = await supabaseRest<Array<Record<string, unknown>>>("audit_logs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "health_document_deleted", entity_type: "health_documents", entity_id: id, metadata: { module: "health", private: true, cleanup_pending: cleanupPending, ...(cleanupPending ? { storage_key: document.storage_key } : {}) } }) });
        if (!Array.isArray(rows) || rows.length !== 1 || !healthUuid(rows[0].id) || rows[0].family_id !== membership.family_id || rows[0].actor_user_id !== user.userId || rows[0].entity_id !== id || rows[0].action !== "health_document_deleted") throw new Error("Removal audit acknowledgement missing.");
      },
    });
    return Response.json(result, { status: result.cleanupPending || result.auditPending ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HealthDocumentError) return Response.json({ code: error.code, error: healthDocumentCopy(error.code, "en"), outcomeUnknown: error.code === "HEALTH_DOC_UNKNOWN", ...(error.operationId ? { operationId: error.operationId } : {}) }, { status: error.status });
    if (error instanceof BackendNotConfiguredError) return Response.json({ code: "HEALTH_DOC_STORAGE" }, { status: 503 });
    console.error("Health document deletion failed.");
    return Response.json({ code: "HEALTH_DOC_UNKNOWN", outcomeUnknown: true }, { status: 503 });
  }
}
