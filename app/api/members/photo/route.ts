import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageProfiles, getActiveFamilyMembership } from "@/lib/family-access";
import { PROFILE_PHOTO_COLLECTION, PROFILE_PHOTO_MARKER } from "@/lib/member-privacy";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  let createdMemoryId: string | null = null;
  let createdFileId: string | null = null;
  let familyId: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    familyId = membership.family_id;
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Private profile storage configured নয়।" }, { status: 503 });

    const form = await request.formData();
    const file = form.get("file");
    const rawMemberId = form.get("memberId");
    const memberId = typeof rawMemberId === "string" ? rawMemberId.trim().slice(0, 80) : "";
    if (!(file instanceof File) || !memberId) return Response.json({ error: "Member এবং image file প্রয়োজন।" }, { status: 400 });
    if (!allowedTypes.has(file.type)) return Response.json({ error: "JPG, PNG অথবা WebP image দিন।" }, { status: 400 });
    if (!file.size || file.size > 5 * 1024 * 1024) return Response.json({ error: "Profile photo সর্বোচ্চ ৫ MB হতে পারবে।" }, { status: 400 });

    const memberQuery = new URLSearchParams({ select: "id,name_bn,auth_user_id", id: `eq.${memberId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const member = (await supabaseRest<Array<{ id: string; name_bn: string; auth_user_id: string | null }>>(`member_profiles?${memberQuery}`))[0];
    if (!member) return Response.json({ error: "Member profile পাওয়া যায়নি।" }, { status: 404 });
    if (!canManageProfiles(membership.role) && member.auth_user_id !== user.userId) return Response.json({ error: "এই profile-এর photo পরিবর্তনের permission নেই।" }, { status: 403 });

    const collectionQuery = new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, name: `eq.${PROFILE_PHOTO_COLLECTION}`, status: "eq.active", limit: "1" });
    let collection = (await supabaseRest<Array<{ id: string }>>(`archive_collections?${collectionQuery}`))[0];
    if (!collection) {
      [collection] = await supabaseRest<Array<{ id: string }>>("archive_collections", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ family_id: membership.family_id, name: PROFILE_PHOTO_COLLECTION, description: "System-managed member profile photos", collection_type: "album", cover_color: "#153A5B", visibility: "family", status: "active", created_by_user_id: user.userId, created_by_name: user.displayName }),
      });
    }

    const tag = `member:${memberId}`;
    const previous = await supabaseRest<Array<{ id: string }>>(`archive_memories?${new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, collection_id: `eq.${collection.id}`, place: `eq.${PROFILE_PHOTO_MARKER}`, people_tags: `cs.{${tag}}`, status: "eq.active" })}`);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    uploadedKey = `families/${membership.family_id}/profiles/${memberId}/${crypto.randomUUID()}.${extension}`;
    await bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { memberId, uploaderId: user.userId } });

    const [memory] = await supabaseRest<Array<{ id: string }>>("archive_memories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ family_id: membership.family_id, collection_id: collection.id, title: `${member.name_bn} profile photo`, description: "Current member profile photo", memory_type: "photo", place: PROFILE_PHOTO_MARKER, people_tags: [tag], visibility: "family", status: "active", uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }),
    });
    createdMemoryId = memory.id;
    const [archiveFile] = await supabaseRest<Array<{ id: string }>>("archive_files", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ family_id: membership.family_id, entity_type: "memory", entity_id: memory.id, storage_key: uploadedKey, file_name: file.name.slice(0, 220), mime_type: file.type, file_size: file.size, visibility: "family", uploaded_by_user_id: user.userId, uploaded_by_name: user.displayName }),
    });
    createdFileId = archiveFile.id;
    if (previous.length) {
      await supabaseRest(`archive_memories?${new URLSearchParams({ id: `in.(${previous.map((item) => item.id).join(",")})`, family_id: `eq.${membership.family_id}` })}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "archived", updated_at: new Date().toISOString() }) });
    }
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "member_profile_photo_updated", entity_type: "member_profile", entity_id: memberId, metadata: { file_id: archiveFile.id } }) });
    return Response.json({ fileId: archiveFile.id, memberId, message: "Member profile photo update হয়েছে।" }, { status: 201 });
  } catch (error) {
    if (createdFileId && familyId) await supabaseRest(`archive_files?${new URLSearchParams({ id: `eq.${createdFileId}`, family_id: `eq.${familyId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined);
    if (createdMemoryId && familyId) await supabaseRest(`archive_memories?${new URLSearchParams({ id: `eq.${createdMemoryId}`, family_id: `eq.${familyId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined);
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to update member photo", error.status, error.message);
    else console.error("Unable to update member photo", error);
    return Response.json({ error: "Member profile photo update হয়নি।" }, { status: 500 });
  }
}
