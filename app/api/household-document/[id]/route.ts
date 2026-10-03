import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHousehold, getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const documentParents = { shopping_list: "household_shopping_lists", bill: "household_utility_bills", maintenance: "household_maintenance_requests" } as const;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return new Response("Sign in is required.", { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return new Response("Family membership required.", { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return new Response("Private storage unavailable.", { status: 503 });
    const { id } = await context.params, query = new URLSearchParams({ select: "storage_key,mime_type,file_name,entity_type,entity_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const document = (await supabaseRest<Array<{ storage_key: string; mime_type: string; file_name: string; entity_type: keyof typeof documentParents; entity_id: string }>>(`household_documents?${query}`))[0]; if (!document) return new Response("Document not found.", { status: 404 });
    const parentTable = documentParents[document.entity_type];
    if (!parentTable) return new Response("Document not found.", { status: 404 });
    const parent = (await supabaseRest<Array<{ id: string }>>(`${parentTable}?${new URLSearchParams({ select: "id", id: `eq.${document.entity_id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!parent) return new Response("Document not found.", { status: 404 });
    const object = await bucket.get(document.storage_key); if (!object) return new Response("Document not found.", { status: 404 });
    const inline = document.mime_type.startsWith("image/") || document.mime_type === "application/pdf";
    return new Response(object.body, { headers: { "Content-Type": document.mime_type, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.file_name)}`, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", ETag: object.httpEtag } });
  } catch (error) { if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 }); if (error instanceof SupabaseRequestError) console.error("Unable to load household document", error.status, error.message); else console.error("Unable to load household document", error); return new Response("Document unavailable.", { status: 500 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership || !canManageHousehold(membership.role)) return Response.json({ error: "Family Admin permission প্রয়োজন।" }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return Response.json({ error: "Private storage unavailable." }, { status: 503 });
    const { id } = await context.params;
    const document = (await supabaseRest<Array<{ storage_key: string }>>(`household_documents?${new URLSearchParams({ select: "storage_key", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!document) return Response.json({ error: "Document পাওয়া যায়নি।" }, { status: 404 });
    const deleted = await supabaseRest<Array<{ id: string }>>(`household_documents?${new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!deleted.length) return Response.json({ error: "Document পাওয়া যায়নি।" }, { status: 404 });
    let cleanupPending = false;
    try { await bucket.delete(document.storage_key); } catch (error) { cleanupPending = true; console.error("Household document storage cleanup pending", error); }
    try {
      await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "household_document_deleted", entity_type: "household_documents", entity_id: id, metadata: { module: "household", cleanup_pending: cleanupPending, ...(cleanupPending ? { storage_key: document.storage_key } : {}) } }) });
    } catch (error) { console.error("Unable to audit household document deletion", error); }
    return Response.json(cleanupPending ? { message: "Document access removed. Private storage cleanup is pending.", cleanupPending: true } : { message: "Household document স্থায়ীভাবে delete হয়েছে।" }, { status: cleanupPending ? 202 : 200 });
  } catch (error) { if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend unavailable." }, { status: 503 }); if (error instanceof SupabaseRequestError) console.error("Unable to delete household document", error.status, error.message); else console.error("Unable to delete household document", error); return Response.json({ error: "Document delete হয়নি।" }, { status: 500 }); }
}
