import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { getAccessibleChatChannel } from "@/lib/family-chat";
import { noticeUuid } from "@/lib/notice-validation";
import { chatAttachmentKey, chatAttachmentPublic } from "@/lib/chat-attachment-policy";
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
    if (!noticeUuid(id)) return new Response("Attachment not found.", { status: 404 });
    const query = new URLSearchParams({
      select: "id,family_id,channel_id,message_id,storage_key,mime_type,file_name,file_size,created_at",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const attachment = (
      await supabaseRest<Array<{ id: string; family_id: string; channel_id: string; message_id: string; storage_key: string; mime_type: string; file_name: string; file_size: number; created_at: string }>>(
        `chat_attachments?${query}`,
      )
    )[0];
    if (!attachment || attachment.id !== id || attachment.family_id !== membership.family_id || !chatAttachmentPublic(attachment)
      || !chatAttachmentKey(attachment.storage_key, membership.family_id, attachment.channel_id)) return new Response("Attachment not found.", { status: 404 });
    const channel = await getAccessibleChatChannel(membership, user.userId, attachment.channel_id);
    if (!channel) return new Response("Attachment not found.", { status: 404 });
    const parentQuery = new URLSearchParams({ select: "id", id: `eq.${attachment.message_id}`, family_id: `eq.${membership.family_id}`, channel_id: `eq.${channel.id}`, message_type: "eq.attachment", limit: "1" });
    const parents = await supabaseRest<Array<{ id: string }>>(`chat_messages?${parentQuery}`);
    if (parents.length !== 1 || parents[0].id !== attachment.message_id) return new Response("Attachment not found.", { status: 404 });
    const object = await bucket.get(attachment.storage_key);
    if (!object || object.size !== attachment.file_size) return new Response("Attachment not found.", { status: 404 });
    const canInline = attachment.mime_type.startsWith("image/")
      || attachment.mime_type.startsWith("audio/")
      || attachment.mime_type.startsWith("video/");
    const headers = new Headers({
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
      "Cache-Control": "private, no-store",
      "Vary": "Cookie, oai-authenticated-user-id",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Referrer-Policy": "no-referrer",
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
