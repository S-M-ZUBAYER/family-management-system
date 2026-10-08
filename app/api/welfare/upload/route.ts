import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageWelfare, getActiveFamilyMembership } from "@/lib/family-access";
import { persistWelfareDocument, welfareDocumentInput, welfareDocumentTables, WelfareDocumentOutcomeUnknownError } from "@/lib/welfare-document-upload";
import { welfareDocumentErrorCopy, welfareDocumentResultCopy } from "@/lib/welfare-document-action-copy";
import { SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { welfareErrorResponse } from "../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageWelfare(membership.role);
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Private receipt storage configured নয়।" }, { status: 503 });
    const form = await request.formData();
    const input = welfareDocumentInput(form, canManage);
    if (!input.value) return Response.json({ code: input.code, error: welfareDocumentErrorCopy(input.code, "en") }, { status: 400 });
    const { file, entityType, entityId: entityIdValue, title, documentType, visibility } = input.value;
    const table = welfareDocumentTables[entityType];
    const entityQuery = new URLSearchParams({ select: "*", id: `eq.${entityIdValue}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const entity = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${entityQuery}`))[0];
    if (!entity) return Response.json({ code: "WELFARE_DOCUMENT_PARENT_MISSING", error: "Linked record not found." }, { status: 404 });
    if (!canManage) {
      const owned = (entityType === "contribution" && entity.contributor_user_id === user.userId) || (entityType === "request" && entity.requester_user_id === user.userId);
      if (!owned) return Response.json({ code: "WELFARE_DOCUMENT_FORBIDDEN", error: "No permission to add evidence to this record." }, { status: 403 });
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase() : "bin";
    const uploadedKey = `families/${membership.family_id}/welfare/${entityType}/${crypto.randomUUID()}.${extension || "bin"}`;
    const result = await persistWelfareDocument(supabaseRest, {
      put: () => bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name.slice(0, 180), uploaderId: user.userId } }),
      remove: () => bucket.delete(uploadedKey),
      metadataRejected: (error) => error instanceof SupabaseRequestError && error.status >= 400 && error.status < 500,
    }, { family_id: membership.family_id, entity_type: entityType, entity_id: entityIdValue, document_type: documentType, storage_key: uploadedKey, file_name: file.name.slice(0, 220), mime_type: file.type, file_size: file.size, title, visibility, uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }, user.userId, canManage);
    return Response.json({ ...result, ...(result.auditPending ? { message: welfareDocumentResultCopy("/api/welfare/upload", result, "en") } : {}) }, { status: result.auditPending ? 202 : 201 });
  } catch (error) {
    if (error instanceof WelfareDocumentOutcomeUnknownError) return Response.json({ code: "WELFARE_DOCUMENT_OUTCOME_UNKNOWN", error: error.message }, { status: 503 });
    return welfareErrorResponse(error, "Unable to upload Welfare document");
  }
}
