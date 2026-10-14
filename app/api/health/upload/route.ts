import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { healthErrorResponse } from "../route";
import { HealthDocumentError, healthDocumentInput, healthDocumentHeader, uploadHealthDocument, healthDocumentCopy } from "@/lib/health-document-workflow";
import { healthUuid } from "@/lib/health-validation";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership required." }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) throw new HealthDocumentError("HEALTH_DOC_STORAGE", 503);
    let form: FormData;
    try { form = await request.formData(); } catch { throw new HealthDocumentError("HEALTH_DOC_INPUT"); }
    const input = healthDocumentInput(form, { familyId: membership.family_id, actorId: user.userId });
    await healthDocumentHeader(input.file);
    const current = await getActiveFamilyMembership(user.userId);
    if (!current || current.family_id !== membership.family_id || current.role !== membership.role) throw new HealthDocumentError("HEALTH_DOC_CONTEXT", 409);
    const id = crypto.randomUUID();
    const key = "families/" + membership.family_id + "/health/" + encodeURIComponent(user.userId) + "/" + id + "." + input.metadata.extension;
    const result = await uploadHealthDocument({
      id, key, input,
      put: () => bucket.put(key, input.file.stream(), { httpMetadata: { contentType: input.metadata.type }, customMetadata: { originalName: input.metadata.name, ownerId: user.userId } }),
      create: () => supabaseRest("health_documents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        id, family_id: membership.family_id, auth_user_id: user.userId, storage_key: key,
        file_name: input.metadata.name, mime_type: input.metadata.type, file_size: input.metadata.size,
        category: input.category, title: input.title, document_date: input.documentDate, notes: input.notes,
      }) }),
      discardUnlinked: async () => {
        const q = new URLSearchParams({ select: "id", storage_key: "eq." + key, limit: "1" });
        const rows = await supabaseRest<unknown[]>("health_documents?" + q);
        if (!Array.isArray(rows) || rows.length) throw new Error("Unlinked object cannot be confirmed.");
        await bucket.delete(key);
      },
      rejected: e => e instanceof SupabaseRequestError && e.status >= 400 && e.status < 500 && e.status !== 408,
      audit: async () => {
        const rows = await supabaseRest<Array<Record<string, unknown>>>("audit_logs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "health_document_uploaded", entity_type: "health_documents", entity_id: id, metadata: { module: "health", private: true } }) });
        if (!Array.isArray(rows) || rows.length !== 1 || !healthUuid(rows[0].id) || rows[0].family_id !== membership.family_id || rows[0].actor_user_id !== user.userId || rows[0].entity_id !== id || rows[0].action !== "health_document_uploaded") throw new Error("Upload audit acknowledgement missing.");
      },
    });
    return Response.json(result, { status: result.auditPending ? 202 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HealthDocumentError) return Response.json({ code: error.code, error: healthDocumentCopy(error.code, "en"), outcomeUnknown: error.code === "HEALTH_DOC_UNKNOWN", ...(error.operationId ? { operationId: error.operationId } : {}) }, { status: error.status });
    return healthErrorResponse(error, "Unable to upload health document");
  }
}
