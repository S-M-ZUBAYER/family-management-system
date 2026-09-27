import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import {
  chatErrorResponse,
  getChatAuthorName,
  getAccessibleChatChannel,
  type ChatAttachmentRow,
  type ChatMessageRow,
} from "@/lib/family-chat";
import { supabaseRest } from "@/lib/supabase-rest";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function fileLimit(mimeType: string) {
  if (mimeType.startsWith("video/")) return 25 * 1024 * 1024;
  if (mimeType.startsWith("audio/")) return 15 * 1024 * 1024;
  if (mimeType.startsWith("image/")) return 8 * 1024 * 1024;
  return 10 * 1024 * 1024;
}

function uuidValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  let createdMessageId: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Private file storage configured নয়।" }, { status: 503 });

    const formData = await request.formData();
    const channelId = uuidValue(formData.get("channelId"));
    const replyToId = uuidValue(formData.get("replyToId"));
    const file = formData.get("file");
    const captionValue = formData.get("caption");
    if (!channelId) return Response.json({ error: "Channel নির্বাচন করুন।" }, { status: 400 });
    const channel = await getAccessibleChatChannel(membership, user.userId, channelId);
    if (!channel) return Response.json({ error: "Channel পাওয়া যায়নি।" }, { status: 404 });
    if (!(file instanceof File) || !allowedTypes.has(file.type)) {
      return Response.json({ error: "ছবি, audio, MP4/WebM, PDF, Word বা Excel file দিন।" }, { status: 400 });
    }
    if (!file.size || file.size > fileLimit(file.type)) {
      return Response.json({ error: "File size অনুমোদিত সীমার বেশি।" }, { status: 400 });
    }
    if (replyToId) {
      const replyQuery = new URLSearchParams({
        select: "id",
        id: `eq.${replyToId}`,
        family_id: `eq.${membership.family_id}`,
        channel_id: `eq.${channel.id}`,
        limit: "1",
      });
      if (!(await supabaseRest<Array<{ id: string }>>(`chat_messages?${replyQuery}`)).length) {
        return Response.json({ error: "Reply message এই channel-এ নেই।" }, { status: 400 });
      }
    }

    const extension = file.name.includes(".")
      ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase()
      : "bin";
    uploadedKey = `families/${membership.family_id}/chat/${channel.id}/${crypto.randomUUID()}.${extension || "bin"}`;
    await bucket.put(uploadedKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name.slice(0, 180), uploaderId: user.userId },
    });

    const caption = typeof captionValue === "string" && captionValue.trim()
      ? captionValue.trim().slice(0, 2000)
      : null;
    const [message] = await supabaseRest<ChatMessageRow[]>("chat_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        channel_id: channel.id,
        auth_user_id: user.userId,
        author_name: await getChatAuthorName(membership.family_id, user),
        message_type: "attachment",
        body: caption,
        reply_to_id: replyToId,
      }),
    });
    createdMessageId = message.id;
    const [attachment] = await supabaseRest<ChatAttachmentRow[]>("chat_attachments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        channel_id: channel.id,
        message_id: message.id,
        storage_key: uploadedKey,
        file_name: file.name.slice(0, 220),
        mime_type: file.type,
        file_size: file.size,
        uploaded_by_user_id: user.userId,
      }),
    });
    await supabaseRest(
      `chat_channels?id=eq.${channel.id}&family_id=eq.${membership.family_id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      },
    );
    return Response.json({ message: { ...message, is_mine: true }, attachment }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    if (createdMessageId) {
      await supabaseRest(`chat_messages?id=eq.${createdMessageId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }).catch(() => undefined);
    }
    return chatErrorResponse(error, "Unable to upload chat attachment");
  }
}
