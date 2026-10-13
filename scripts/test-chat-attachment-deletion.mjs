import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ChatAttachmentDeleteError,chatAttachmentDeleteInput,chatAttachmentMayDelete,chatAttachmentDeleteMatches,chatAttachmentDeleteWrite,chatAttachmentDeleteResponse,chatAttachmentDeleteAcknowledged,readChatAttachmentDeletion,chatAttachmentDeleteCopy,chatAttachmentDeleteActionCopy,chatAttachmentDeleteFeedback} from '../lib/chat-attachment-deletion.ts';
import {chatAttachmentPublic} from '../lib/chat-attachment-policy.ts';
import {chatFeedSnapshot,reconcileChatMessages} from '../lib/chat-text-management.ts';
const family='20000000-0000-4000-8000-000000000002',channel='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000011',fileId='20000000-0000-4000-8000-000000000012',other='20000000-0000-4000-8000-000000000013',actor='qa-owner',stamp='2026-10-13T05:00:00Z';
const message={id,family_id:family,channel_id:channel,auth_user_id:actor,author_name:'QA author',message_type:'attachment',body:'QA caption',reply_to_id:null,edited_at:null,created_at:stamp};
const file={id:fileId,family_id:family,channel_id:channel,message_id:id,uploaded_by_user_id:actor,storage_key:`families/${family}/chat/${channel}/${fileId}.png`,file_name:'QA.png',mime_type:'image/png',file_size:68,created_at:stamp};
const body={expectedMessageId:id,expectedBody:message.body,expectedEditedAt:null,expectedCreatedAt:stamp,expectedFileCreatedAt:stamp},input=chatAttachmentDeleteInput(body),path='/api/chat-file/'+fileId;
const opts=(extra={})=>({message,file,write:async()=>[message],cleanup:async()=>{},audit:async()=>{},sync:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
test('delete input requires exact original identity/version/null-caption and rejects unknown fields and coercion',()=>{
 assert.deepEqual(input,body);assert.equal(chatAttachmentDeleteInput({...body,expectedBody:null}).expectedBody,null);
 for(const raw of [null,[],true,{...body,auth_user_id:actor},{...body,expectedMessageId:'bad'},{...body,expectedBody:true},{...body,expectedBody:'x'.repeat(5001)},{...body,expectedCreatedAt:''},{...body,expectedFileCreatedAt:'bad'},{...body,expectedEditedAt:undefined}])assert.throws(()=>chatAttachmentDeleteInput(raw),ChatAttachmentDeleteError);
 assert.equal(chatAttachmentDeleteMatches(input,message,file),true);for(const patch of [{body:'changed'},{id:other},{edited_at:stamp},{created_at:'2026-10-13T05:01:00Z'}])assert.equal(chatAttachmentDeleteMatches(input,{...message,...patch},file),false);
 assert.equal(chatAttachmentDeleteMatches(input,message,{...file,created_at:'2026-10-13T05:01:00Z'}),false);
});
test('stored message author and file uploader both govern ownership; no admin/name/client flag bypass',()=>{
 assert.equal(chatAttachmentMayDelete(message,file,actor),true);
 for(const a of ['', 'different-author','owner','family_admin'])assert.equal(chatAttachmentMayDelete(message,file,a),false);
 for(const m of [{...message,auth_user_id:'other',is_mine:true},{...message,message_type:'text'},{...message,message_type:'system'}])assert.equal(chatAttachmentMayDelete(m,file,actor),false);
 for(const f of [{...file,uploaded_by_user_id:'other',is_mine:true},{...file,family_id:other},{...file,channel_id:other},{...file,message_id:other}])assert.equal(chatAttachmentMayDelete(message,f,actor),false);
 const projected=chatAttachmentPublic(file,true);assert.equal(projected.is_mine,true);assert.equal(chatAttachmentPublic(file,false).is_mine,false);assert.equal(chatAttachmentPublic({...file,is_mine:'true'}),null);
 for(const k of ['family_id','uploaded_by_user_id','storage_key'])assert.equal(Object.hasOwn(projected,k),false);
});
test('delete confirmation precedes captured-key cleanup/audit/refresh, with independent pending flags',async()=>{
 for(const cleanupPending of [false,true])for(const auditPending of [false,true])for(const syncPending of [false,true]){
  const order=[],result=await chatAttachmentDeleteWrite(opts({write:async()=>{order.push('write');return[message];},cleanup:async()=>{order.push('cleanup');if(cleanupPending)throw Error('simulated');},audit:async flag=>{order.push('audit');assert.equal(flag,cleanupPending);if(auditPending)throw Error('simulated');},sync:async()=>{order.push('sync');if(syncPending)throw Error('simulated');}}));
  assert.deepEqual(order,['write','cleanup','audit','sync']);assert.equal(result.cleanupPending,cleanupPending);assert.equal(result.auditPending,auditPending);assert.equal(result.syncPending,syncPending);
  const r=chatAttachmentDeleteResponse(result),p=await r.json();assert.equal(r.status,cleanupPending||auditPending||syncPending?202:200);assert.equal(chatAttachmentDeleteAcknowledged(fileId,channel,input,r.status,p),true);
  for(const k of ['storage_key','file_name','family_id','auth_user_id','message'])assert.equal(Object.hasOwn(p,k),false);
 }
});
test('empty/stale/wrong-row/lost delete responses never clean storage or write a phantom audit',async()=>{
 for(const value of [[],null,{},[{}],[message,message],[{...message,id:other}],[{...message,family_id:other}],[{...message,channel_id:other}],[{...message,auth_user_id:'other'}],[{...message,body:'changed'}],[{...message,reply_to_id:other}],[{...message,edited_at:stamp}]])await assert.rejects(chatAttachmentDeleteWrite(opts({write:async()=>value,cleanup:async()=>assert.fail('unsafe cleanup'),audit:async()=>assert.fail('phantom audit'),sync:async()=>assert.fail('refresh')})),e=>e.code===(Array.isArray(value)&&value.length===0?'CHAT_FILE_DELETE_CHANGED':'CHAT_FILE_DELETE_UNKNOWN'));
 for(const error of [Error('lost'),{status:408},{status:502},{status:409}])await assert.rejects(chatAttachmentDeleteWrite(opts({write:async()=>{throw error;},cleanup:async()=>assert.fail('cleanup'),audit:async()=>assert.fail('audit')})),e=>e.code===(error.status===409?'CHAT_FILE_DELETE_REJECTED':'CHAT_FILE_DELETE_UNKNOWN'));
 let writes=0;await assert.rejects(chatAttachmentDeleteWrite(opts({file:{...file,storage_key:file.storage_key.replace(family,other)},write:async()=>writes++})),ChatAttachmentDeleteError);assert.equal(writes,0);
});
test('typed delete acknowledgements bind file/message/channel and pending status; Cancel needs no parse',async()=>{
 const r=chatAttachmentDeleteResponse(await chatAttachmentDeleteWrite(opts())),p=await r.json();
 for(const raw of [{},{...p,id:other},{...p,messageId:other},{...p,channelId:other},{...p,deleted:'true'},{...p,cleanupPending:'false'},{...p,auditPending:undefined},{...p,outcomeUnknown:true}])assert.equal(chatAttachmentDeleteAcknowledged(fileId,channel,input,200,raw),false);
 assert.equal(chatAttachmentDeleteAcknowledged(fileId,channel,input,202,p),false);
 for(const [status,raw,kind]of [[499,null,'cancelled'],[400,{code:'CHAT_FILE_DELETE_INPUT'},'rejected'],[403,{code:'CHAT_FILE_DELETE_FORBIDDEN'},'rejected'],[409,{code:'CHAT_FILE_DELETE_CHANGED'},'rejected'],[503,{code:'CHAT_FILE_DELETE_STORAGE'},'rejected'],[408,{},'unknown'],[503,{},'unknown'],[200,{},'unknown'],[200,p,'confirmed']])assert.equal((await readChatAttachmentDeletion(async()=>Response.json(raw,{status}),fileId,channel,input)).kind,kind);
 assert.equal((await readChatAttachmentDeletion(async()=>{throw Error('lost');},fileId,channel,input)).kind,'unknown');
});
test('bilingual destructive confirmation and known/pending/unknown results remain distinct',async()=>{
 const response=chatAttachmentDeleteResponse(await chatAttachmentDeleteWrite(opts())),p=await response.json();
 for(const locale of ['bn','en']){for(const code of ['CHAT_FILE_DELETE_INPUT','CHAT_FILE_DELETE_FORBIDDEN','CHAT_FILE_DELETE_NOT_FOUND','CHAT_FILE_DELETE_CHANGED','CHAT_FILE_DELETE_MULTIPLE','CHAT_FILE_DELETE_STORAGE','CHAT_FILE_DELETE_REJECTED','CHAT_FILE_DELETE_PENDING','CHAT_FILE_DELETE_UNKNOWN'])assert.ok(chatAttachmentDeleteCopy(code,locale));
  const copy=chatAttachmentDeleteActionCopy(path,'DELETE',locale);assert.equal(copy.destructive,true);assert.ok(copy.description.includes('Cancel/×'));
  assert.equal(chatAttachmentDeleteFeedback(path,200,p,locale,'DELETE',body),null);assert.equal(chatAttachmentDeleteFeedback(path,200,{},locale,'DELETE',body).kind,'info');assert.equal(chatAttachmentDeleteFeedback(path,503,{code:'CHAT_FILE_DELETE_STORAGE'},locale,'DELETE',body).kind,'error');assert.equal(chatAttachmentDeleteFeedback(path,409,{code:'CHAT_FILE_DELETE_CHANGED'},locale,'DELETE',body).kind,'error');
  const pending=await chatAttachmentDeleteResponse(await chatAttachmentDeleteWrite(opts({cleanup:async()=>{throw Error('simulated');}}))).json();assert.equal(chatAttachmentDeleteFeedback(path,202,pending,locale,'DELETE',body).kind,'info');
 }
 assert.equal(chatAttachmentDeleteFeedback(path,503,{},'en','GET'),null);assert.equal(chatAttachmentDeleteActionCopy(path,'GET','en'),null);
});
test('ownership survives safe feed projection while local tombstones prevent stale stream resurrection',()=>{
 const publicMessage={...message,is_mine:true},publicFile=chatAttachmentPublic(file,true),raw={channel:{id:channel},messages:[publicMessage],reactions:[],attachments:[publicFile]};
 assert.equal(chatFeedSnapshot(raw,channel).attachments[0].is_mine,true);assert.equal(chatFeedSnapshot({...raw,attachments:[{...publicFile,is_mine:'true'}]},channel),null);
 const removed=new Set([id]);assert.deepEqual(reconcileChatMessages([], [publicMessage], removed),[]);
});
test('route/UI/provider use stored ownership, single-link guard, conditional family scope and one captured key',()=>{
 const route=readFileSync(new URL('../app/api/chat-file/[id]/route.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/family-chat.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8'),data=readFileSync(new URL('../lib/family-chat.ts',import.meta.url),'utf8');
 for(const t of ['getActiveFamilyMembership(user.userId)','getAccessibleChatChannel','chatAttachmentMayDelete','chatAttachmentDeleteMatches','siblings.length!==1','message_type:"eq.attachment"','created_at:`eq.${message.created_at}`','family_id:`eq.${membership.family_id}`','return=representation','cleanup:()=>bucket.delete(file.storage_key as string)','chat_attachment_deleted'])assert.ok(route.includes(t),t);
 for(const t of ['file.is_mine!==true','readChatAttachmentDeletion','if(response.status===499)','outcome.kind==="cancelled"','setVerifyKind("attachment-delete")','removedText.current.add(message.id)','setAttachments(current=>current.filter','messageAttachments[0].is_mine===true'])assert.ok(ui.includes(t),t);
 assert.ok(provider.includes('chatAttachmentDeleteActionCopy(pathname,method,locale)'));assert.ok(provider.includes('attachmentDeleteResult ??'));assert.ok(provider.includes('attachmentDeleteFailure ??'));assert.ok(data.includes('is_mine:uploaded_by_user_id===user.userId'));
});
