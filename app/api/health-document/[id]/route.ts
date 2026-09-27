import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

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
    const query = new URLSearchParams({
      select: "storage_key,mime_type,file_name",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      auth_user_id: `eq.${user.userId}`,
      limit: "1",
    });
    const document = (
      await supabaseRest<Array<{ storage_key: string; mime_type: string; file_name: string }>>(
        `health_documents?${query}`,
      )
    )[0];
    if (!document) return new Response("Document not found.", { status: 404 });
    const object = await bucket.get(document.storage_key);
    if (!object) return new Response("Document not found.", { status: 404 });
    const canInline = document.mime_type.startsWith("image/") || document.mime_type === "application/pdf";
    return new Response(object.body, {
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to load health document", error.status, error.message);
    else console.error("Unable to load health document", error);
    return new Response("Document unavailable.", { status: 500 });
  }
}
