import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { getAccessibleChatChannel } from "@/lib/family-chat";
import { supabaseRest, SupabaseRequestError } from "@/lib/supabase-rest";
import { noticeUuid, noticeObject } from "@/lib/notice-validation";
import { ChatTextError, chatTextRecord, chatTextMayChange, chatNextEditedAt, chatTextWrite, chatTextResponse, chatTextCopy } from "@/lib/chat-text-management";
async function change(request: Request, context: { params: Promise<{id: string}> }, method: "PATCH"|"DELETE") {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({code:"CHAT_TEXT_FORBIDDEN"},{status:401});
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) throw new ChatTextError("CHAT_TEXT_FORBIDDEN",403);
    const {id} = await context.params; if (!noticeUuid(id)) throw new ChatTextError("CHAT_TEXT_INVALID_INPUT");
    const input = chatTextRecord(method,await request.json().catch(()=>{throw new ChatTextError("CHAT_TEXT_INVALID_INPUT");}));
    const q = new URLSearchParams({select:"id,family_id,channel_id,auth_user_id,author_name,message_type,body,reply_to_id,edited_at,created_at",id:`eq.${id}`,family_id:`eq.${membership.family_id}`,limit:"1"});
    const rows = await supabaseRest<unknown>(`chat_messages?${q}`);
    if (!Array.isArray(rows) || rows.length>1) throw new ChatTextError("CHAT_TEXT_UNKNOWN",503);
    const row=rows[0]; if (!row) throw new ChatTextError("CHAT_TEXT_NOT_FOUND",404);
    if (!noticeObject(row) || row.family_id!==membership.family_id || !noticeUuid(row.channel_id) || row.id!==id.toLowerCase()) throw new ChatTextError("CHAT_TEXT_UNKNOWN",503);
    const channel=await getAccessibleChatChannel(membership,user.userId,row.channel_id); if (!channel) throw new ChatTextError("CHAT_TEXT_NOT_FOUND",404);
    if (!chatTextMayChange(row,user.userId)) throw new ChatTextError("CHAT_TEXT_FORBIDDEN",403);
    if (row.body!==input.expectedBody || row.edited_at!==input.expectedEditedAt) throw new ChatTextError("CHAT_TEXT_CHANGED",409);
    const files=await supabaseRest<Array<{id:string}>>(`chat_attachments?${new URLSearchParams({select:"id",family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,message_id:`eq.${row.id}`,limit:"1"})}`);
    if (!Array.isArray(files)) throw new ChatTextError("CHAT_TEXT_UNKNOWN",503); if (files.length) throw new ChatTextError("CHAT_TEXT_HAS_FILES",409);
    const editedAt=method==="PATCH" ? chatNextEditedAt({created_at:row.created_at as string,edited_at:row.edited_at as string|null}) : undefined;
    const target=new URLSearchParams({id:`eq.${row.id}`,family_id:`eq.${membership.family_id}`,channel_id:`eq.${channel.id}`,auth_user_id:`eq.${user.userId}`,message_type:"eq.text",created_at:`eq.${row.created_at}`,edited_at:row.edited_at===null?"is.null":`eq.${row.edited_at}`});
    const result=await chatTextWrite({method,row,body:input.body,editedAt,rejected:e=>e instanceof SupabaseRequestError && e.status>=400 && e.status<500 && e.status!==408,
      write:()=>supabaseRest(`chat_messages?${target}`,{method,headers:{Prefer:"return=representation"},...(method==="PATCH"?{body:JSON.stringify({body:input.body,edited_at:editedAt})}:{})}),
      audit:()=>supabaseRest("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({family_id:membership.family_id,actor_user_id:user.userId,action:method==="PATCH"?"chat_message_edited":"chat_message_deleted",entity_type:"chat_message",entity_id:row.id,metadata:{channel_id:channel.id}})}),
    }); return chatTextResponse(result);
  } catch(e) { const known=e instanceof ChatTextError; if(!known)console.error("Chat text change unavailable."); const code=known?e.code:"CHAT_TEXT_UNKNOWN";return Response.json({code,error:chatTextCopy(code,"en"),...(code==="CHAT_TEXT_UNKNOWN"?{outcomeUnknown:true}:{})},{status:known?e.status:503}); }
}
export async function PATCH(request: Request,context:{params:Promise<{id:string}>}){return change(request,context,"PATCH");}
export async function DELETE(request: Request,context:{params:Promise<{id:string}>}){return change(request,context,"DELETE");}
