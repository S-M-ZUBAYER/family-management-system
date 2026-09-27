import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { ArchiveFile } from "@/lib/archive-types";
import { canManageArchives, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { archiveErrorResponse } from "../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const allowedMemory = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const allowedVault = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const text = (value: FormDataEntryValue | null, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const visibility = (value: FormDataEntryValue | null) => value === "admins" || value === "private" ? value : "family";
const tags = (value: FormDataEntryValue | null) => typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30).map((item) => item.slice(0, 80)) : [];

export async function POST(request: Request) {
  let uploadedKey: string | null = null, entityTable: string | null = null, entityId: string | null = null;
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageArchives(membership.role), bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return Response.json({ error: "Private archive storage configured নয়।" }, { status: 503 });
    const form = await request.formData(), file = form.get("file"), mode = form.get("mode"); if (!(file instanceof File) || (mode !== "memory" && mode !== "vault")) return Response.json({ error: "Valid file ও upload mode প্রয়োজন।" }, { status: 400 });
    const allowed = mode === "memory" ? allowedMemory : allowedVault, limit = mode === "memory" ? 30 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!allowed.has(file.type)) return Response.json({ error: mode === "memory" ? "Image, MP4/WebM, audio, PDF বা Word file দিন।" : "Image, PDF অথবা Word document দিন।" }, { status: 400 });
    if (!file.size || file.size > limit) return Response.json({ error: `${mode === "memory" ? "Memory" : "Vault document"} সর্বোচ্চ ${limit / 1024 / 1024} MB হতে পারবে।` }, { status: 400 });
    const title = text(form.get("title"), 180) ?? file.name.slice(0, 180); let itemVisibility = visibility(form.get("visibility"));
    let memoryCollection: { id: string; visibility: string; created_by_user_id: string } | null = null;
    if (mode === "memory") {
      const collectionId = text(form.get("collectionId"), 80); if (!collectionId) return Response.json({ error: "Collection নির্বাচন করুন।" }, { status: 400 });
      const query = new URLSearchParams({ select: "id,visibility,created_by_user_id", id: `eq.${collectionId}`, family_id: `eq.${membership.family_id}`, status: "eq.active", limit: "1" });
      memoryCollection = (await supabaseRest<Array<{ id: string; visibility: string; created_by_user_id: string }>>(`archive_collections?${query}`))[0] ?? null;
      if (!memoryCollection || (memoryCollection.visibility === "admins" && !canManage && memoryCollection.created_by_user_id !== user.userId) || (memoryCollection.visibility === "private" && memoryCollection.created_by_user_id !== user.userId)) return Response.json({ error: "এই collection-এ upload করা যাবে না।" }, { status: 403 });
      if (memoryCollection.visibility === "private" || (memoryCollection.visibility === "admins" && itemVisibility === "family")) itemVisibility = memoryCollection.visibility as "private" | "admins";
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase() : "bin";
    uploadedKey = `families/${membership.family_id}/archives/${mode}/${crypto.randomUUID()}.${extension || "bin"}`;
    await bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name.slice(0, 180), uploaderId: user.userId } });

    if (mode === "memory") {
      const collectionId = memoryCollection!.id;
      entityTable = "archive_memories";
      const memoryType = file.type.startsWith("image/") ? "photo" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
      const [created] = await supabaseRest<Array<{ id: string }>>(entityTable, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, collection_id: collectionId, title, description: text(form.get("description"), 3000), memory_type: memoryType, memory_date: text(form.get("memoryDate"), 10), place: text(form.get("place"), 220), people_tags: tags(form.get("peopleTags")), visibility: itemVisibility, status: "active", uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }) }); entityId = created.id;
    } else {
      entityTable = "archive_vault_documents";
      const categories = ["property_deed", "nid", "passport", "birth_certificate", "legal", "financial", "insurance", "education", "other"];
      const categoryValue = text(form.get("category"), 40); const category = categoryValue && categories.includes(categoryValue) ? categoryValue : "other";
      const [created] = await supabaseRest<Array<{ id: string }>>(entityTable, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, title, category, owner_name: text(form.get("ownerName"), 180), document_number_masked: text(form.get("documentNumberMasked"), 180), issue_date: text(form.get("issueDate"), 10), expiry_date: text(form.get("expiryDate"), 10), issuer: text(form.get("issuer"), 220), notes: text(form.get("notes"), 3000), visibility: itemVisibility, uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }) }); entityId = created.id;
    }
    const [archiveFile] = await supabaseRest<ArchiveFile[]>("archive_files", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, entity_type: mode === "memory" ? "memory" : "vault_document", entity_id: entityId, storage_key: uploadedKey, file_name: file.name.slice(0, 220), mime_type: file.type, file_size: file.size, visibility: itemVisibility, uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }) });
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: `archive_${mode}_uploaded`, entity_type: entityTable, entity_id: entityId, metadata: { file_id: archiveFile.id, visibility: itemVisibility } }) });
    return Response.json({ file: archiveFile, entityId }, { status: 201 });
  } catch (error) {
    if (entityTable && entityId) { const filter = new URLSearchParams({ id: `eq.${entityId}` }); await supabaseRest(`${entityTable}?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined); }
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    return archiveErrorResponse(error, "Unable to upload archive file");
  }
}
