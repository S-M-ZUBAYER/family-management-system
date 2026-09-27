import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { getAccessibleChatChannel } from "@/lib/family-chat";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

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
      select: "channel_id,storage_key,mime_type,file_name",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const attachment = (
      await supabaseRest<Array<{ channel_id: string; storage_key: string; mime_type: string; file_name: string }>>(
        `chat_attachments?${query}`,
      )
    )[0];
    if (!attachment) return new Response("Attachment not found.", { status: 404 });
    const channel = await getAccessibleChatChannel(membership, user.userId, attachment.channel_id);
    if (!channel) return new Response("Attachment not found.", { status: 404 });
    const object = await bucket.get(attachment.storage_key);
    if (!object) return new Response("Attachment not found.", { status: 404 });
    const canInline = attachment.mime_type.startsWith("image/")
      || attachment.mime_type.startsWith("audio/")
      || attachment.mime_type.startsWith("video/")
      || attachment.mime_type === "application/pdf";
    const headers = new Headers({
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
      "Cache-Control": "private, max-age=600",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to load chat attachment", error.status, error.message);
    else console.error("Unable to load chat attachment", error);
    return new Response("Attachment unavailable.", { status: 500 });
  }
}
