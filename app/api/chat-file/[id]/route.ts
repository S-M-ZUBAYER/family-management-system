import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { getAccessibleChatChannel } from "@/lib/family-chat";
import { noticeUuid } from "@/lib/notice-validation";
import { chatAttachmentKey, chatAttachmentPublic } from "@/lib/chat-attachment-policy";
import { noticeObject } from "@/lib/notice-validation";
import { ChatAttachmentDeleteError,chatAttachmentDeleteInput,chatAttachmentMayDelete,chatAttachmentDeleteMatches,chatAttachmentDeleteWrite,chatAttachmentDeleteResponse,chatAttachmentDeleteCopy } from "@/lib/chat-attachment-deletion";
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

export async function DELETE(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    const user=await getChatGPTUser();if(!user)return Response.json({code:"CHAT_FILE_DELETE_FORBIDDEN"},{status:401});
    const membership=await getActiveFamilyMembership(user.userId);if(!membership)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_FORBIDDEN",403);
    const {id:rawId}=await context.params;if(!noticeUuid(rawId))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_INPUT");const id=rawId.toLowerCase();
    const input=chatAttachmentDeleteInput(await request.json().catch(()=>{throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_INPUT");}));
    const attachmentSelect="id,family_id,channel_id,message_id,storage_key,file_name,mime_type,file_size,uploaded_by_user_id,created_at";
    const fileQuery=new URLSearchParams({select:attachmentSelect,id:`eq.${id}`,family_id:`eq.${membership.family_id}`,limit:"1"});
    const files=await supabaseRest<unknown>(`chat_attachments?${fileQuery}`);
    if(!Array.isArray(files)||files.length>1)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_UNKNOWN",503);
    const file=files[0];if(!file)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_NOT_FOUND",404);
    if(!noticeObject(file)||file.id!==id||file.family_id!==membership.family_id||!chatAttachmentPublic(file)||!chatAttachmentKey(file.storage_key,membership.family_id,file.channel_id as string))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_UNKNOWN",503);
    const channel=await getAccessibleChatChannel(membership,user.userId,file.channel_id as string);if(!channel)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_NOT_FOUND",404);
    const parentQuery=new URLSearchParams({select:"id,family_id,channel_id,auth_user_id,author_name,message_type,body,reply_to_id,edited_at,created_at",id:`eq.${file.message_id}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,limit:"1"});
    const parents=await supabaseRest<unknown>(`chat_messages?${parentQuery}`);
    if(!Array.isArray(parents)||parents.length!==1||!noticeObject(parents[0]))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_UNKNOWN",503);
    const message=parents[0];
    if(!chatAttachmentMayDelete(message,file,user.userId))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_FORBIDDEN",403);
    if(!chatAttachmentDeleteMatches(input,message,file))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_CHANGED",409);
    // Upload creates immutable one-file messages. Reject unexpected legacy or
    // externally modified multi-file links; never guess which object to remove.
    const siblingQuery=new URLSearchParams({select:attachmentSelect,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,message_id:`eq.${message.id}`,limit:"2"});
    const siblings=await supabaseRest<unknown>(`chat_attachments?${siblingQuery}`);
    if(!Array.isArray(siblings))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_UNKNOWN",503);
    if(siblings.length!==1)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_MULTIPLE",409);
    if(!noticeObject(siblings[0])||Object.keys(file).some(k=>siblings[0][k]!==file[k]))throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_CHANGED",409);
    const bucket=(env as RuntimeEnv).BUCKET;if(!bucket)throw new ChatAttachmentDeleteError("CHAT_FILE_DELETE_STORAGE",503);
    const target=new URLSearchParams({id:`eq.${message.id}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,auth_user_id:`eq.${user.userId}`,message_type:"eq.attachment",created_at:`eq.${message.created_at}`,edited_at:message.edited_at===null?"is.null":`eq.${message.edited_at}`,body:message.body===null?"is.null":`eq.${message.body}`,reply_to_id:message.reply_to_id===null?"is.null":`eq.${message.reply_to_id}`});
    const result=await chatAttachmentDeleteWrite({message,file,
      write:()=>supabaseRest(`chat_messages?${target}`,{method:"DELETE",headers:{Prefer:"return=representation"}}),
      cleanup:()=>bucket.delete(file.storage_key as string),
      rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
      audit:cleanupPending=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:"chat_attachment_deleted",entity_type:"chat_attachments",entity_id:file.id,metadata:{channel_id:channel.id,message_id:message.id,cleanup_pending:cleanupPending}})}),
      sync:()=>supabaseRest(`chat_channels?id=eq.${channel.id}&family_id=eq.${membership.family_id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({updated_at:new Date().toISOString()})}),
    });return chatAttachmentDeleteResponse(result);
  }catch(error){const known=error instanceof ChatAttachmentDeleteError;if(!known)console.error("Chat attachment deletion unavailable.");const code=known?error.code:"CHAT_FILE_DELETE_UNKNOWN";return Response.json({code,error:chatAttachmentDeleteCopy(code,"en"),...(code==="CHAT_FILE_DELETE_UNKNOWN"?{outcomeUnknown:true}:{})},{status:known?error.status:503});}
}
