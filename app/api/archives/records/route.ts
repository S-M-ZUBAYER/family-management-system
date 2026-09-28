import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageArchives, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { archiveErrorResponse } from "../route";

const actions = ["create_collection", "create_story", "create_asset", "create_capsule", "update_status"] as const;
type Action = (typeof actions)[number];
type ArchiveKind = "collection" | "story" | "asset" | "capsule";
const archiveTables: Record<ArchiveKind, string> = { collection: "archive_collections", story: "archive_stories", asset: "family_assets", capsule: "time_capsules" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const number = (value: unknown, fallback?: number) => { if (value === "" || value === null || value === undefined) return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; };
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && values.includes(candidate as T) ? candidate as T : fallback; }
function tags(value: unknown) { return typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30).map((item) => item.slice(0, 80)) : []; }

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageArchives(membership.role), body = await request.json() as { action?: Action; data?: Record<string, unknown> };
    if (!body.action || !actions.includes(body.action)) return Response.json({ error: "Valid archive action প্রয়োজন।" }, { status: 400 });
    const data = body.data ?? {}; let table = ""; let record: Record<string, unknown> = {};
    if (body.action === "create_collection") {
      if (!canManage) return Response.json({ error: "Family Admin collection তৈরি করবেন।" }, { status: 403 });
      const name = text(data.name, 160); if (!name) return Response.json({ error: "Collection name প্রয়োজন।" }, { status: 400 });
      table = "archive_collections"; record = { family_id: membership.family_id, name, description: text(data.description, 2000), collection_type: choice(data.collectionType, ["album", "heritage", "documents", "property", "time_capsule", "other"] as const, "album"), cover_color: text(data.coverColor, 20) ?? "#153A5B", visibility: choice(data.visibility, ["family", "admins", "private"] as const, "family"), status: "active", created_by_user_id: user.userId, created_by_name: user.displayName };
    } else if (body.action === "create_story") {
      const title = text(data.title, 180), content = text(data.content, 20000); if (!title || !content) return Response.json({ error: "Story title ও content প্রয়োজন।" }, { status: 400 });
      table = "archive_stories"; record = { family_id: membership.family_id, title, content, story_date: text(data.storyDate, 10), storyteller: text(data.storyteller, 180), people_tags: tags(data.peopleTags), place: text(data.place, 220), visibility: choice(data.visibility, ["family", "admins"] as const, "family"), status: canManage ? "published" : "pending", author_user_id: user.userId, author_name: user.displayName };
    } else if (body.action === "create_asset") {
      if (!canManage) return Response.json({ error: "Family Admin asset register পরিচালনা করবেন।" }, { status: 403 });
      const title = text(data.title, 180), value = number(data.estimatedValue, 0); if (!title || value === undefined || value < 0) return Response.json({ error: "Asset title ও value সঠিকভাবে দিন।" }, { status: 400 });
      table = "family_assets"; record = { family_id: membership.family_id, title, asset_type: choice(data.assetType, ["land", "house", "flat", "vehicle", "business", "investment", "jewelry", "other"] as const, "other"), ownership: text(data.ownership, 300), location: text(data.location, 1000), identifier_masked: text(data.identifierMasked, 180), acquisition_date: text(data.acquisitionDate, 10), estimated_value: value, notes: text(data.notes, 3000), visibility: choice(data.visibility, ["family", "admins"] as const, "admins"), status: "active", created_by_user_id: user.userId };
    } else if (body.action === "create_capsule") {
      const title = text(data.title, 180), message = text(data.message, 20000), unlockAt = text(data.unlockAt, 40); if (!title || !message || !unlockAt || new Date(unlockAt).getTime() <= Date.now() + 60000) return Response.json({ error: "Title, message এবং ভবিষ্যতের unlock time প্রয়োজন।" }, { status: 400 });
      table = "time_capsules"; record = { family_id: membership.family_id, title, message, recipient_names: text(data.recipientNames, 1000), unlock_at: unlockAt, visibility: choice(data.visibility, ["family", "admins"] as const, "family"), status: "locked", created_by_user_id: user.userId, created_by_name: user.displayName };
    } else return updateStatus(data, membership.family_id, user.userId, canManage);
    const [created] = await supabaseRest<Array<Record<string, unknown>>>(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
    await audit(membership.family_id, user.userId, body.action, table, String(created.id)); return Response.json({ record: created }, { status: 201 });
  } catch (error) { return archiveErrorResponse(error, "Unable to save archive record"); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageArchives(membership.role), body = await request.json() as { kind?: ArchiveKind; recordId?: unknown; data?: Record<string, unknown> };
    const kind = body.kind, recordId = text(body.recordId, 80); if (!kind || !(kind in archiveTables) || !recordId || !uuid.test(recordId)) return Response.json({ error: "Valid archive record প্রয়োজন।" }, { status: 400 });
    const table = archiveTables[kind], existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${new URLSearchParams({ select: "*", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "Archive record পাওয়া যায়নি।" }, { status: 404 });
    const ownerId = kind === "story" ? existing.author_user_id : existing.created_by_user_id;
    if (!canManage && ownerId !== user.userId) return Response.json({ error: "এই record edit করার permission নেই।" }, { status: 403 });
    if (!canManage && !["story", "capsule"].includes(kind)) return Response.json({ error: "Family Admin action প্রয়োজন।" }, { status: 403 });
    if (kind === "capsule" && (existing.status !== "locked" || new Date(String(existing.unlock_at)).getTime() <= Date.now())) return Response.json({ error: "Opened/unlocked capsule edit করা যাবে না।" }, { status: 409 });
    const changes = archiveChanges(kind, body.data ?? {}, canManage); if (changes instanceof Response) return changes; changes.updated_at = new Date().toISOString();
    const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
    await audit(membership.family_id, user.userId, `archive_${kind}_updated`, table, recordId); return Response.json({ record: updated });
  } catch (error) { return archiveErrorResponse(error, "Unable to update archive record"); }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageArchives(membership.role), body = await request.json() as { kind?: ArchiveKind; recordId?: unknown };
    const kind = body.kind, recordId = text(body.recordId, 80); if (!kind || !(kind in archiveTables) || !recordId || !uuid.test(recordId)) return Response.json({ error: "Valid archive record প্রয়োজন।" }, { status: 400 });
    const table = archiveTables[kind], existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${new URLSearchParams({ select: "*", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "Archive record পাওয়া যায়নি।" }, { status: 404 });
    const ownerId = kind === "story" ? existing.author_user_id : existing.created_by_user_id;
    if (!canManage && ownerId !== user.userId) return Response.json({ error: "এই record delete করার permission নেই।" }, { status: 403 });
    if (kind === "collection") { const memory = (await supabaseRest<Array<{ id: string }>>(`archive_memories?${new URLSearchParams({ select: "id", collection_id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0]; if (memory) return Response.json({ error: "Collection-এ memory আছে। Delete না করে Archive করুন।" }, { status: 409 }); }
    if (kind === "capsule" && existing.status === "opened") return Response.json({ error: "Opened time capsule audit history-এর জন্য delete করা যাবে না।" }, { status: 409 });
    await supabaseRest(`${table}?${new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await audit(membership.family_id, user.userId, `archive_${kind}_deleted`, table, recordId); return Response.json({ message: `${kind} record স্থায়ীভাবে delete হয়েছে।` });
  } catch (error) { return archiveErrorResponse(error, "Unable to delete archive record"); }
}

function archiveChanges(kind: ArchiveKind, data: Record<string, unknown>, canManage: boolean): Record<string, unknown> | Response {
  if (kind === "collection") { if (!canManage) return Response.json({ error: "Family Admin collection edit করবেন।" }, { status: 403 }); const name = text(data.name, 160); if (!name) return Response.json({ error: "Collection name প্রয়োজন।" }, { status: 400 }); return { name, description: text(data.description, 2000), collection_type: choice(data.collectionType, ["album", "heritage", "documents", "property", "time_capsule", "other"] as const, "album"), cover_color: text(data.coverColor, 20) ?? "#153A5B", visibility: choice(data.visibility, ["family", "admins", "private"] as const, "family") }; }
  if (kind === "story") { const title = text(data.title, 180), content = text(data.content, 20000); if (!title || !content) return Response.json({ error: "Story title ও content প্রয়োজন।" }, { status: 400 }); return { title, content, story_date: text(data.storyDate, 10), storyteller: text(data.storyteller, 180), people_tags: tags(data.peopleTags), place: text(data.place, 220), visibility: choice(data.visibility, ["family", "admins"] as const, "family") }; }
  if (kind === "asset") { if (!canManage) return Response.json({ error: "Family Admin asset edit করবেন।" }, { status: 403 }); const title = text(data.title, 180), value = number(data.estimatedValue, 0); if (!title || value === undefined || value < 0) return Response.json({ error: "Asset title ও value সঠিকভাবে দিন।" }, { status: 400 }); return { title, asset_type: choice(data.assetType, ["land", "house", "flat", "vehicle", "business", "investment", "jewelry", "other"] as const, "other"), ownership: text(data.ownership, 300), location: text(data.location, 1000), identifier_masked: text(data.identifierMasked, 180), acquisition_date: text(data.acquisitionDate, 10), estimated_value: value, notes: text(data.notes, 3000), visibility: choice(data.visibility, ["family", "admins"] as const, "admins") }; }
  const title = text(data.title, 180), message = text(data.message, 20000), unlockAt = text(data.unlockAt, 40); if (!title || !message || !unlockAt || new Date(unlockAt).getTime() <= Date.now() + 60000) return Response.json({ error: "Title, message এবং ভবিষ্যতের unlock time প্রয়োজন।" }, { status: 400 });
  return { title, message, recipient_names: text(data.recipientNames, 1000), unlock_at: unlockAt, visibility: choice(data.visibility, ["family", "admins"] as const, "family") };
}

async function updateStatus(data: Record<string, unknown>, familyId: string, userId: string, canManage: boolean) {
  const entity = choice(data.entity, ["collection", "memory", "story", "asset", "capsule"] as const, "story"), id = text(data.id, 80), status = text(data.status, 40); if (!id || !uuid.test(id) || !status) return Response.json({ error: "Record ও status প্রয়োজন।" }, { status: 400 });
  const tables = { collection: "archive_collections", memory: "archive_memories", story: "archive_stories", asset: "family_assets", capsule: "time_capsules" } as const;
  const allowed = { collection: ["active", "archived"], memory: ["active", "archived"], story: ["draft", "pending", "published", "archived"], asset: ["active", "disputed", "sold", "inactive"], capsule: ["opened", "cancelled"] }[entity]; if (!allowed.includes(status)) return Response.json({ error: "Status গ্রহণযোগ্য নয়।" }, { status: 400 });
  const table = tables[entity], query = new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" }); const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${query}`))[0]; if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
  const ownerId = entity === "collection" ? existing.created_by_user_id : entity === "memory" ? existing.uploaded_by_user_id : entity === "story" ? existing.author_user_id : entity === "capsule" ? existing.created_by_user_id : null;
  if (!canManage) {
    const ownerAllowed = ownerId === userId && ((entity === "story" && ["draft", "pending", "archived"].includes(status)) || (entity === "memory" && status === "archived") || (entity === "capsule" && status === "cancelled"));
    if (!ownerAllowed) return Response.json({ error: "এই record update করার অনুমতি নেই।" }, { status: 403 });
  }
  if (entity === "capsule" && status === "opened" && new Date(String(existing.unlock_at)).getTime() > Date.now()) return Response.json({ error: "Time capsule এখনও locked।" }, { status: 409 });
  const changes: Record<string, unknown> = { status, updated_at: new Date().toISOString() }; if (entity === "capsule" && status === "opened") changes.opened_at = new Date().toISOString();
  const filter = new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${familyId}` }); const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
  await audit(familyId, userId, `archive_${entity}_${status}`, table, id); return Response.json({ record: updated });
}

async function audit(familyId: string, userId: string, action: string, entityType: string, entityId: string) { await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "archives" } }) }); }
