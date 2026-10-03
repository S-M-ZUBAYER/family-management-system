import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { ArchiveCollection, ArchiveFile, ArchiveMemory, ArchivePayload, ArchiveStory, FamilyAsset, TimeCapsule, VaultDocument } from "@/lib/archive-types";
import { canManageArchives, getActiveFamilyMembership } from "@/lib/family-access";
import { PROFILE_PHOTO_COLLECTION, PROFILE_PHOTO_MARKER } from "@/lib/member-privacy";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type CollectionRow = Omit<ArchiveCollection, "is_mine">;
type MemoryRow = Omit<ArchiveMemory, "is_mine">;
type StoryRow = Omit<ArchiveStory, "is_mine">;
type DocumentRow = Omit<VaultDocument, "is_mine">;
type CapsuleRow = Omit<TimeCapsule, "is_mine" | "is_unlocked">;
type FileRow = Omit<ArchiveFile, "is_mine">;

async function readAllArchiveRows<T>(table: string, query: URLSearchParams): Promise<T[]> {
  return collectPaginatedRows(
    (offset, limit) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set("offset", String(offset));
      pageQuery.set("limit", String(limit));
      return supabaseRest<T[]>(`${table}?${pageQuery}`);
    },
    { pageSize: 500, maxRows: 20000 },
  );
}

export function archiveErrorResponse(error: unknown, label: string) {
  if (error instanceof PaginatedRowLimitError) return Response.json({ code: "ARCHIVE_ROW_LIMIT", maxRows: error.maxRows, error: `Archive history exceeds ${error.maxRows} rows in one section. No partial data was shown; contact support for a paged export.` }, { status: 413 });
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ error: "Archive data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 }); }
  console.error(label, error); return Response.json({ error: "Archive request সম্পন্ন হয়নি।" }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 });
    const canManage = canManageArchives(membership.role), familyQuery = new URLSearchParams({ select: "id,name_bn,name_en", id: `eq.${membership.family_id}`, limit: "1" });
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${familyQuery}`))[0];
    let collections: CollectionRow[] = [], memories: MemoryRow[] = [], stories: StoryRow[] = [], documents: DocumentRow[] = [], assets: FamilyAsset[] = [], capsules: CapsuleRow[] = [], files: FileRow[] = [];
    let migrationRequired = false;
    try {
      const family_id = `eq.${membership.family_id}`, query = (select: string, order: string) => new URLSearchParams({ select, family_id, order });
      [collections, memories, stories, documents, assets, capsules, files] = await Promise.all([
        readAllArchiveRows<CollectionRow>("archive_collections", query("id,name,description,collection_type,cover_color,visibility,status,created_by_user_id,created_by_name,created_at", "status.asc,created_at.desc,id.asc")),
        readAllArchiveRows<MemoryRow>("archive_memories", query("id,collection_id,title,description,memory_type,memory_date,place,people_tags,visibility,status,uploaded_by_user_id,uploaded_by_name,created_at", "memory_date.desc.nullslast,created_at.desc,id.asc")),
        readAllArchiveRows<StoryRow>("archive_stories", query("id,title,content,story_date,storyteller,people_tags,place,visibility,status,author_user_id,author_name,created_at,updated_at", "story_date.desc.nullslast,created_at.desc,id.asc")),
        readAllArchiveRows<DocumentRow>("archive_vault_documents", query("id,title,category,owner_name,document_number_masked,issue_date,expiry_date,issuer,notes,visibility,uploaded_by_user_id,uploaded_by_name,created_at,updated_at", "expiry_date.asc.nullslast,created_at.desc,id.asc")),
        readAllArchiveRows<FamilyAsset>("family_assets", query("id,title,asset_type,ownership,location,identifier_masked,acquisition_date,estimated_value,notes,visibility,status,created_at,updated_at", "status.asc,asset_type.asc,created_at.desc,id.asc")),
        readAllArchiveRows<CapsuleRow>("time_capsules", query("id,title,message,recipient_names,unlock_at,visibility,status,created_by_user_id,created_by_name,opened_at,created_at", "unlock_at.asc,created_at.desc,id.asc")),
        readAllArchiveRows<FileRow>("archive_files", query("id,entity_type,entity_id,file_name,mime_type,file_size,visibility,uploaded_by_user_id,uploaded_by_name,created_at", "created_at.desc,id.asc")),
      ]);
    } catch (error) { if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true; else throw error; }
    const allowed = (visibility: string, ownerId: string) => visibility === "family" || (visibility === "admins" && canManage) || ownerId === user.userId;
    // Profile images belong to the directory, not the general family archive.
    collections = collections.filter((item) => item.name !== PROFILE_PHOTO_COLLECTION && allowed(item.visibility, item.created_by_user_id));
    const collectionIds = new Set(collections.map((item) => item.id));
    memories = memories.filter((item) => item.place !== PROFILE_PHOTO_MARKER && collectionIds.has(item.collection_id) && allowed(item.visibility, item.uploaded_by_user_id));
    stories = stories.filter((item) => (item.status === "published" && (item.visibility === "family" || canManage)) || item.author_user_id === user.userId || canManage);
    documents = documents.filter((item) => allowed(item.visibility, item.uploaded_by_user_id));
    if (!canManage) assets = assets.filter((item) => item.visibility === "family");
    capsules = capsules.filter((item) => (item.visibility === "family" || canManage || item.created_by_user_id === user.userId) && item.status !== "cancelled");
    const memoryIds = new Set(memories.map((item) => item.id));
    const documentIds = new Set(documents.map((item) => item.id));
    files = files.filter((item) => allowed(item.visibility, item.uploaded_by_user_id) && (item.entity_type === "memory" ? memoryIds.has(item.entity_id) : documentIds.has(item.entity_id)));
    const now = Date.now();
    const payload: ArchivePayload = {
      family, viewer: { displayName: user.displayName, role: membership.role },
      collections: collections.map((item) => ({ ...item, is_mine: item.created_by_user_id === user.userId })),
      memories: memories.map((item) => ({ ...item, is_mine: item.uploaded_by_user_id === user.userId })),
      stories: stories.map((item) => ({ ...item, is_mine: item.author_user_id === user.userId })),
      documents: documents.map((item) => ({ ...item, is_mine: item.uploaded_by_user_id === user.userId })),
      assets,
      capsules: capsules.map((item) => { const unlocked = new Date(item.unlock_at).getTime() <= now || item.status === "opened"; return { ...item, message: unlocked ? item.message : null, is_mine: item.created_by_user_id === user.userId, is_unlocked: unlocked }; }),
      files: files.map((item) => ({ ...item, is_mine: item.uploaded_by_user_id === user.userId })),
      permissions: { canManage }, migrationRequired,
    };
    return Response.json(payload);
  } catch (error) { return archiveErrorResponse(error, "Unable to load family archives"); }
}
