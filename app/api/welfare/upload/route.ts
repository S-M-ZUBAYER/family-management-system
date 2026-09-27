import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageWelfare, getActiveFamilyMembership } from "@/lib/family-access";
import type { WelfareDocument } from "@/lib/welfare-types";
import { supabaseRest } from "@/lib/supabase-rest";
import { welfareErrorResponse } from "../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const entityTables = { fund: "welfare_funds", contribution: "welfare_contributions", expense: "welfare_expenses", request: "welfare_requests" } as const;
const documentTypes = ["receipt", "invoice", "approval", "evidence", "other"];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageWelfare(membership.role);
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Private receipt storage configured নয়।" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("file");
    const entityTypeValue = form.get("entityType");
    const entityIdValue = form.get("entityId");
    const titleValue = form.get("title");
    const documentTypeValue = form.get("documentType");
    const visibilityValue = form.get("visibility");
    if (!(file instanceof File) || !allowedTypes.has(file.type)) return Response.json({ error: "JPG, PNG, WebP, PDF বা Word document দিন।" }, { status: 400 });
    if (!file.size || file.size > 12 * 1024 * 1024) return Response.json({ error: "Receipt/document সর্বোচ্চ ১২ MB হতে পারবে।" }, { status: 400 });
    if (typeof entityTypeValue !== "string" || !(entityTypeValue in entityTables) || typeof entityIdValue !== "string") return Response.json({ error: "Valid linked record প্রয়োজন।" }, { status: 400 });
    const entityType = entityTypeValue as keyof typeof entityTables;
    const table = entityTables[entityType];
    const entityQuery = new URLSearchParams({ select: "*", id: `eq.${entityIdValue}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const entity = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${entityQuery}`))[0];
    if (!entity) return Response.json({ error: "Linked record পাওয়া যায়নি।" }, { status: 404 });
    if (!canManage) {
      const owned = (entityType === "contribution" && entity.contributor_user_id === user.userId) || (entityType === "request" && entity.requester_user_id === user.userId);
      if (!owned) return Response.json({ error: "এই record-এ document যোগ করার অনুমতি নেই।" }, { status: 403 });
    }
    const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim().slice(0, 180) : file.name.slice(0, 180);
    const documentType = typeof documentTypeValue === "string" && documentTypes.includes(documentTypeValue) ? documentTypeValue : "other";
    const visibility = canManage && visibilityValue === "family" ? "family" : "admins";
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase() : "bin";
    uploadedKey = `families/${membership.family_id}/welfare/${entityType}/${crypto.randomUUID()}.${extension || "bin"}`;
    await bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name.slice(0, 180), uploaderId: user.userId } });
    const [document] = await supabaseRest<WelfareDocument[]>("welfare_documents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, entity_type: entityType, entity_id: entityIdValue, document_type: documentType, storage_key: uploadedKey, file_name: file.name.slice(0, 220), mime_type: file.type, file_size: file.size, title, visibility, uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }) });
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    return welfareErrorResponse(error, "Unable to upload Welfare document");
  }
}
