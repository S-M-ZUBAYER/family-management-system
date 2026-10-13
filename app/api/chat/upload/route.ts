import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { chatErrorResponse, getChatAuthorName, getAccessibleChatChannel } from "@/lib/family-chat";
import { chatAttachmentInput, validateChatAttachment, ChatAttachmentError, chatAttachmentCopy } from "@/lib/chat-attachment-policy";
import { chatAttachmentWrite } from "@/lib/chat-attachment-write";
import { SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership required." }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) throw new ChatAttachmentError("CHAT_FILE_STORAGE",503);
    let form:FormData;try{form=await request.formData();}catch{throw new ChatAttachmentError("CHAT_FILE_INPUT");}
    const input=chatAttachmentInput(form), channel=await getAccessibleChatChannel(membership,user.userId,input.channelId);
    if(!channel)return Response.json({error:"Channel not found."},{status:404});
    const metadata=await validateChatAttachment(input.file);
    if(input.replyToId){
      const query=new URLSearchParams({select:"id",id:`eq.${input.replyToId}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,limit:"1"});
      if(!(await supabaseRest<Array<{id:string}>>(`chat_messages?${query}`)).length)throw new ChatAttachmentError("CHAT_FILE_INPUT");
    }
    const messageId=crypto.randomUUID(),attachmentId=crypto.randomUUID();
    const key=`families/${membership.family_id}/chat/${channel.id}/${attachmentId}.${metadata.extension}`;
    const author=await getChatAuthorName(membership.family_id,user);
    const post=(table:string,data:Record<string,unknown>)=>supabaseRest(table,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(data)});
    const removeQuery=new URLSearchParams({id:`eq.${messageId}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,auth_user_id:`eq.${user.userId}`,message_type:"eq.attachment",edited_at:"is.null"});
    const result=await chatAttachmentWrite({familyId:membership.family_id,channelId:channel.id,actorId:user.userId,messageId,attachmentId,key,file:metadata,caption:input.caption,replyToId:input.replyToId,
      put:()=>bucket.put(key,input.file.stream(),{httpMetadata:{contentType:metadata.type},customMetadata:{originalName:metadata.name,uploaderId:user.userId}}),
      createMessage:()=>post("chat_messages",{id:messageId,family_id:membership.family_id,channel_id:channel.id,auth_user_id:user.userId,author_name:author,message_type:"attachment",body:input.caption,reply_to_id:input.replyToId}),
      createAttachment:()=>post("chat_attachments",{id:attachmentId,family_id:membership.family_id,channel_id:channel.id,message_id:messageId,storage_key:key,file_name:metadata.name,mime_type:metadata.type,file_size:metadata.size,uploaded_by_user_id:user.userId}),
      removeMessage:row=>{
        const target=new URLSearchParams(removeQuery);
        target.set("created_at",`eq.${row.created_at}`);
        target.set("body",row.body===null?"is.null":`eq.${row.body}`);
        target.set("reply_to_id",row.reply_to_id===null?"is.null":`eq.${row.reply_to_id}`);
        return supabaseRest(`chat_messages?${target}`,{method:"DELETE",headers:{Prefer:"return=representation"}});
      },
      discard:()=>bucket.delete(key),
      rejected:e=>e instanceof SupabaseRequestError&&e.status>=400&&e.status<500&&e.status!==408,
      sync:()=>supabaseRest(`chat_channels?id=eq.${channel.id}&family_id=eq.${membership.family_id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({updated_at:new Date().toISOString()})}),
      audit:()=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:"chat_attachment_uploaded",entity_type:"chat_attachments",entity_id:attachmentId,metadata:{channel_id:channel.id,message_id:messageId}})}),
    });
    const pending=result.auditPending||result.syncPending;
    return Response.json({...result,...(pending?{code:"CHAT_FILE_PENDING"}:{})},{status:pending?202:201});
  } catch(error) {
    if(error instanceof ChatAttachmentError)return Response.json({code:error.code,error:chatAttachmentCopy(error.code,"en"),...(error.code==="CHAT_FILE_UNKNOWN"?{outcomeUnknown:true}:{})},{status:error.status});
    return chatErrorResponse(error,"Unable to upload chat attachment");
  }
}
