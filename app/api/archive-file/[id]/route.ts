import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canMutateArchiveRecord } from "@/lib/archive-access";
import { canManageArchives, canViewAdministration, getActiveFamilyMembership } from "@/lib/family-access";
import { canViewDirectoryProfile, PROFILE_PHOTO_MARKER } from "@/lib/member-privacy";
import type { DirectoryVisibility } from "@/lib/privacy-types";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return new Response("Sign in is required.", { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return new Response("Family membership required.", { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return new Response("Private storage unavailable.", { status: 503 });
    const { id } = await context.params, query = new URLSearchParams({ select: "storage_key,mime_type,file_name,visibility,uploaded_by_user_id,entity_type,entity_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const file = (await supabaseRest<Array<{ storage_key: string; mime_type: string; file_name: string; visibility: string; uploaded_by_user_id: string; entity_type: "memory" | "vault_document"; entity_id: string }>>(`archive_files?${query}`))[0]; if (!file) return new Response("File not found.", { status: 404 });
    const canManage = canManageArchives(membership.role);
    let entityAllowed = false;
    let isProfilePhoto = false;
    if (file.entity_type === "memory") {
      const memoryQuery = new URLSearchParams({ select: "visibility,uploaded_by_user_id,collection_id,place,people_tags", id: `eq.${file.entity_id}`, family_id: `eq.${membership.family_id}`, status: "eq.active", limit: "1" });
      const memory = (await supabaseRest<Array<{ visibility: string; uploaded_by_user_id: string; collection_id: string; place: string | null; people_tags: string[] | null }>>(`archive_memories?${memoryQuery}`))[0];
      if (memory) {
        const collectionQuery = new URLSearchParams({ select: "visibility,created_by_user_id", id: `eq.${memory.collection_id}`, family_id: `eq.${membership.family_id}`, status: "eq.active", limit: "1" });
        const collection = (await supabaseRest<Array<{ visibility: string; created_by_user_id: string }>>(`archive_collections?${collectionQuery}`))[0];
        const visible = (value: string, owner: string) => value === "family" || owner === user.userId || (value === "admins" && canManage);
        entityAllowed = Boolean(collection && visible(memory.visibility, memory.uploaded_by_user_id) && visible(collection.visibility, collection.created_by_user_id));
        if (entityAllowed && memory.place === PROFILE_PHOTO_MARKER) {
          isProfilePhoto = true;
          const memberId = memory.people_tags?.find((tag) => tag.startsWith("member:"))?.slice(7);
          if (!memberId) return new Response("Not authorized.", { status: 403 });
          const profile = (await supabaseRest<Array<{ auth_user_id: string | null }>>(`member_profiles?${new URLSearchParams({ select: "auth_user_id", id: `eq.${memberId}`, family_id: `eq.${membership.family_id}`, profile_status: "neq.archived", limit: "1" })}`))[0];
          if (!profile) return new Response("Not authorized.", { status: 403 });
          let visibility: DirectoryVisibility | undefined;
          if (profile.auth_user_id && profile.auth_user_id !== user.userId && !canViewAdministration(membership.role)) {
            const consent = (await supabaseRest<Array<{ directory_visibility: DirectoryVisibility }>>(`family_privacy_consents?${new URLSearchParams({ select: "directory_visibility", family_id: `eq.${membership.family_id}`, user_id: `eq.${profile.auth_user_id}`, limit: "1" })}`))[0];
            visibility = consent?.directory_visibility;
          }
          entityAllowed = canViewDirectoryProfile(profile.auth_user_id, visibility, user.userId, canViewAdministration(membership.role));
        }
      }
    } else {
      const documentQuery = new URLSearchParams({ select: "visibility,uploaded_by_user_id", id: `eq.${file.entity_id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
      const document = (await supabaseRest<Array<{ visibility: string; uploaded_by_user_id: string }>>(`archive_vault_documents?${documentQuery}`))[0];
      entityAllowed = Boolean(document && (document.visibility === "family" || document.uploaded_by_user_id === user.userId || (document.visibility === "admins" && canManage)));
    }
    const fileAllowed = file.visibility === "family" || file.uploaded_by_user_id === user.userId || (file.visibility === "admins" && canManage); if (!fileAllowed || !entityAllowed) return new Response("Not authorized.", { status: 403 });
    const object = await bucket.get(file.storage_key); if (!object) return new Response("File not found.", { status: 404 });
    const inline = file.mime_type.startsWith("image/") || file.mime_type.startsWith("video/") || file.mime_type.startsWith("audio/") || file.mime_type === "application/pdf";
    return new Response(object.body, { headers: { "Content-Type": file.mime_type, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`, "Cache-Control": isProfilePhoto ? "private, no-store" : "private, max-age=600", "X-Content-Type-Options": "nosniff", ETag: object.httpEtag } });
  } catch (error) { if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 }); if (error instanceof SupabaseRequestError) console.error("Unable to load archive file", error.status, error.message); else console.error("Unable to load archive file", error); return new Response("File unavailable.", { status: 500 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Family membership required." }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return Response.json({ error: "Private storage unavailable." }, { status: 503 });
    const { id } = await context.params;
    const file = (await supabaseRest<Array<{ storage_key: string; visibility: string; uploaded_by_user_id: string; entity_type: "memory" | "vault_document"; entity_id: string }>>(`archive_files?${new URLSearchParams({ select: "storage_key,visibility,uploaded_by_user_id,entity_type,entity_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!file) return Response.json({ error: "Archive file পাওয়া যায়নি।" }, { status: 404 });
    const entityTable = file.entity_type === "memory" ? "archive_memories" : "archive_vault_documents";
    const canManage = canManageArchives(membership.role);
    if (!canMutateArchiveRecord(file.visibility, file.uploaded_by_user_id, user.userId, canManage)) return Response.json({ error: "File delete করার permission নেই।" }, { status: 403 });
    const parent = (await supabaseRest<Array<{ id: string; visibility: string; uploaded_by_user_id: string; collection_id?: string; place?: string | null }>>(`${entityTable}?${new URLSearchParams({ select: file.entity_type === "memory" ? "id,visibility,uploaded_by_user_id,collection_id,place" : "id,visibility,uploaded_by_user_id", id: `eq.${file.entity_id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (parent?.place === PROFILE_PHOTO_MARKER) return Response.json({ error: "Profile photos must be changed from the member directory." }, { status: 409 });
    if (parent && !canMutateArchiveRecord(parent.visibility, parent.uploaded_by_user_id, user.userId, canManage)) return Response.json({ error: "Record delete করার permission নেই।" }, { status: 403 });
    if (parent?.collection_id) {
      const collection = (await supabaseRest<Array<{ visibility: string; created_by_user_id: string }>>(`archive_collections?${new URLSearchParams({ select: "visibility,created_by_user_id", id: `eq.${parent.collection_id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
      if (!collection || !canMutateArchiveRecord(collection.visibility, collection.created_by_user_id, user.userId, canManage)) return Response.json({ error: "Collection delete করার permission নেই।" }, { status: 403 });
    }
    const attachedFiles = await supabaseRest<Array<{ id: string }>>(`archive_files?${new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, entity_type: `eq.${file.entity_type}`, entity_id: `eq.${file.entity_id}`, limit: "2" })}`);
    if (attachedFiles.length !== 1 || attachedFiles[0].id !== id) return Response.json({ error: "This record has multiple files. Delete them through an approved archive cleanup workflow." }, { status: 409 });
    if (parent) {
      const parentFilter = new URLSearchParams({ id: `eq.${file.entity_id}`, family_id: `eq.${membership.family_id}` });
      if (!canManage) parentFilter.set("uploaded_by_user_id", `eq.${user.userId}`);
      const deletedParent = await supabaseRest<Array<{ id: string }>>(`${entityTable}?${parentFilter}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (!deletedParent.length) return Response.json({ error: "Archive record পাওয়া যায়নি।" }, { status: 404 });
    }
    const deletedFile = await supabaseRest<Array<{ id: string }>>(`archive_files?${new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}`, entity_type: `eq.${file.entity_type}`, entity_id: `eq.${file.entity_id}` })}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!deletedFile.length) return Response.json({ error: "Archive file পাওয়া যায়নি।" }, { status: 404 });
    let cleanupPending = false;
    try { await bucket.delete(file.storage_key); } catch (error) { cleanupPending = true; console.error("Archive file storage cleanup pending", error); }
    try {
      await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: `archive_${file.entity_type}_deleted`, entity_type: entityTable, entity_id: file.entity_id, metadata: { module: "archives", visibility: file.visibility, file_id: id, cleanup_pending: cleanupPending, ...(cleanupPending ? { storage_key: file.storage_key } : {}) } }) });
    } catch (error) { console.error("Unable to audit archive deletion", error); }
    return Response.json(cleanupPending ? { message: "Archive record removed. Private storage cleanup is pending.", cleanupPending: true } : { message: `${file.entity_type.replaceAll("_", " ")} এবং file স্থায়ীভাবে delete হয়েছে।` }, { status: cleanupPending ? 202 : 200 });
  } catch (error) { if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend unavailable." }, { status: 503 }); if (error instanceof SupabaseRequestError) console.error("Unable to delete archive file", error.status, error.message); else console.error("Unable to delete archive file", error); return Response.json({ error: "Archive file delete হয়নি।" }, { status: 500 }); }
}
