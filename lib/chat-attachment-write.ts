import { noticeObject } from "./notice-validation.ts";
import { chatMessagePublic } from "./chat-text-management.ts";
import { ChatAttachmentError, chatAttachmentKey, chatAttachmentPublic, type chatAttachmentMetadata } from "./chat-attachment-policy.ts";

// DB and R2 are separate. Keep possibly linked objects on ambiguous writes;
// never compensate a confirmed attachment because a later audit/refresh failed.
export async function chatAttachmentWrite(o: {
  familyId:string; channelId:string; actorId:string; messageId:string; attachmentId:string; key:string;
  file:ReturnType<typeof chatAttachmentMetadata>; caption:string|null; replyToId:string|null;
  put:()=>Promise<unknown>; createMessage:()=>Promise<unknown>; createAttachment:()=>Promise<unknown>;
  removeMessage:(row:Record<string,unknown>)=>Promise<unknown>; discard:()=>Promise<unknown>; rejected:(e:unknown)=>boolean;
  sync:()=>Promise<unknown>; audit:()=>Promise<unknown>;
}) {
  if(!chatAttachmentKey(o.key,o.familyId,o.channelId))throw new ChatAttachmentError("CHAT_FILE_INPUT");
  const discard=async()=>{try{await o.discard();}catch{throw new ChatAttachmentError("CHAT_FILE_UNKNOWN",503);}};
  try{await o.put();}catch{await discard();throw new ChatAttachmentError("CHAT_FILE_REJECTED",503);}
  let rawMessage:Record<string,unknown>;
  try{
    const rows=await o.createMessage(), row=Array.isArray(rows)&&rows.length===1?rows[0]:null;
    const message=chatMessagePublic(row,true);
    if(!noticeObject(row)||!message||row.id!==o.messageId||row.family_id!==o.familyId||row.channel_id!==o.channelId||row.auth_user_id!==o.actorId
      ||message.message_type!=="attachment"||message.body!==o.caption||message.reply_to_id!==o.replyToId||message.edited_at!==null)throw new ChatAttachmentError("CHAT_FILE_UNKNOWN",503);
    rawMessage=row;
  }catch(error){
    if(o.rejected(error)){await discard();throw new ChatAttachmentError("CHAT_FILE_REJECTED",400);}
    throw new ChatAttachmentError("CHAT_FILE_UNKNOWN",503);
  }
  let attachment:NonNullable<ReturnType<typeof chatAttachmentPublic>>;
  try{
    const rows=await o.createAttachment(),row=Array.isArray(rows)&&rows.length===1?rows[0]:null, projected=chatAttachmentPublic(row);
    if(!noticeObject(row)||!projected||row.id!==o.attachmentId||row.family_id!==o.familyId||row.channel_id!==o.channelId||row.message_id!==o.messageId
      ||row.uploaded_by_user_id!==o.actorId||row.storage_key!==o.key||projected.file_name!==o.file.name||projected.mime_type!==o.file.type||projected.file_size!==o.file.size)
      throw new ChatAttachmentError("CHAT_FILE_UNKNOWN",503);
    attachment=projected;
  }catch(error){
    if(o.rejected(error)){
      // Definite attachment rejection permits conditional rollback of this
      // captured message only. Confirm its row before discarding the object.
      try{
        const rows=await o.removeMessage(rawMessage);
        if(!Array.isArray(rows)||rows.length!==1||!noticeObject(rows[0])||["id","family_id","channel_id","auth_user_id","message_type","created_at","body","reply_to_id","edited_at"].some(k=>rows[0][k]!==rawMessage[k]))throw Error("Unconfirmed rollback");
      }catch{throw new ChatAttachmentError("CHAT_FILE_UNKNOWN",503);}
      await discard();throw new ChatAttachmentError("CHAT_FILE_REJECTED",400);
    }
    throw new ChatAttachmentError("CHAT_FILE_UNKNOWN",503);
  }
  let syncPending=false,auditPending=false;
  try{await o.sync();}catch{syncPending=true;console.error("Chat attachment saved; channel refresh pending.");}
  try{await o.audit();}catch{auditPending=true;console.error("Chat attachment saved; audit pending.");}
  return {success:true as const,message:chatMessagePublic(rawMessage,true)!,attachment,syncPending,auditPending};
}
