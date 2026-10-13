import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {ChatTextError,chatTextRecord,chatTextMayChange,chatMessagePublic,chatNextEditedAt,chatTextWrite,chatTextResponse,chatTextAcknowledged,readChatTextChange,chatTextFeedback,chatTextActionCopy,chatTextCopy,chatFeedSnapshot,reconcileChatMessages} from '../lib/chat-text-management.ts';
const family='20000000-0000-4000-8000-000000000002',channel='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000011',other='20000000-0000-4000-8000-000000000012',stamp='2026-10-13T04:00:00Z',edited='2026-10-13T04:01:00Z';
const row={id,family_id:family,channel_id:channel,auth_user_id:'qa-owner',author_name:'QA author',message_type:'text',body:'Original text',reply_to_id:null,edited_at:null,created_at:stamp};
const body={expectedBody:row.body,expectedEditedAt:null,body:'Edited text'};
const options=(method,extra={})=>({method,row,body:body.body,editedAt:edited,write:async()=>[{...row,...(method==='PATCH'?{body:body.body,edited_at:edited}:{})}],audit:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
const response=async(method,extra={})=>chatTextResponse(await chatTextWrite(options(method,extra)));
test('strict body/version/key limits reject coercion, missing token and truncation; original text remains exact',()=>{
 assert.deepEqual(chatTextRecord('PATCH',{...body,body:' New ',expectedBody:' Original '}),{body:'New',expectedBody:' Original ',expectedEditedAt:null});
 for(const raw of [null,[],true,{...body,auth_user_id:'spoof'}])assert.throws(()=>chatTextRecord('PATCH',raw),ChatTextError);
 for(const value of [null,1,[],{},'', 'x'.repeat(5001)])assert.throws(()=>chatTextRecord('PATCH',{...body,body:value}),ChatTextError);
 for(const value of [undefined,'bad',true])assert.throws(()=>chatTextRecord('PATCH',{...body,expectedEditedAt:value}),ChatTextError);
 assert.equal(chatTextRecord('PATCH',{...body,body:'ক'.repeat(5000)}).body.length,5000);assert.throws(()=>chatTextRecord('POST',body),ChatTextError);
});
test('only stored author of text may change; admin/name/attachment/system grants no bypass',()=>{
 assert.equal(chatTextMayChange(row,'qa-owner'),true);assert.equal(chatTextMayChange(row,'admin'),false);
 for(const patch of [{message_type:'attachment'},{message_type:'system'},{auth_user_id:null},{body:null},{created_at:'bad'}])assert.equal(chatTextMayChange({...row,...patch},'qa-owner'),false);
 const safe=chatMessagePublic(row,true);assert.equal(safe.is_mine,true);for(const key of ['family_id','auth_user_id'])assert.equal(Object.hasOwn(safe,key),false);
 assert.equal(chatMessagePublic(row),null);
});
test('edit token advances monotonically even with same/future clock or existing version',()=>{
 assert.ok(Date.parse(chatNextEditedAt(row,Date.parse(stamp)))>Date.parse(stamp));
 assert.ok(Date.parse(chatNextEditedAt({...row,edited_at:edited},0))>Date.parse(edited));
 assert.equal(chatNextEditedAt(row,Date.parse(edited)),new Date(edited).toISOString());
});
test('one confirmed scoped write precedes one audit; changed fields/empty CAS/lost reply never create phantom audits',async()=>{
 for(const method of ['PATCH','DELETE'])for(const pending of [false,true]){
  const order=[];const r=await response(method,{write:async()=>{order.push('write');return[{...row,...(method==='PATCH'?{body:body.body,edited_at:edited}:{})}];},audit:async()=>{order.push('audit');if(pending)throw Error('controlled audit failure');}}),p=await r.json();
  assert.deepEqual(order,['write','audit']);assert.equal(r.status,pending?202:200);assert.equal(chatTextAcknowledged(method,id,channel,method==='PATCH'?body:{expectedBody:row.body,expectedEditedAt:null},r.status,p),true);
 }
 for(const method of ['PATCH','DELETE']){const good={...row,...(method==='PATCH'?{body:body.body,edited_at:edited}:{})};let audits=0;
  await assert.rejects(chatTextWrite(options(method,{write:async()=>[],audit:async()=>audits++})),e=>e.code==='CHAT_TEXT_CHANGED');
  for(const value of [null,{},[good,good],...['id','family_id','channel_id','auth_user_id','author_name','message_type','created_at','reply_to_id','body','edited_at'].map(k=>[{...good,[k]:'wrong'}])])await assert.rejects(chatTextWrite(options(method,{write:async()=>value,audit:async()=>audits++})),e=>e.code==='CHAT_TEXT_UNKNOWN');
  assert.equal(audits,0);
  for(const error of [Error('lost'),{status:408},{status:503},{status:409}]){let calls=0;await assert.rejects(chatTextWrite(options(method,{write:async()=>{calls++;throw error;}})),e=>e.code===(error.status===409?'CHAT_TEXT_REJECTED':'CHAT_TEXT_UNKNOWN'));assert.equal(calls,1);}
 }
});
test('typed acknowledgement binds ID/channel/own text/version and strictly distinguishes pending',async()=>{
 const p=await(await response('PATCH')).json();
 for(const value of [null,{}, {...p,id:other},{...p,channelId:other},{...p,auditPending:'true'},{...p,success:'true'},{...p,message:{...p.message,is_mine:false}},{...p,message:{...p.message,body:'wrong'}},{...p,message:{...p.message,edited_at:null}}])assert.equal(chatTextAcknowledged('PATCH',id,channel,body,200,value),false);
 assert.equal(chatTextAcknowledged('PATCH',id,channel,body,202,p),false);
});
test('cancel/rejected/pending/unknown are distinct and requests are never automatically retried',async()=>{
 const p=await(await response('PATCH')).json();for(const [status,value,kind]of [[499,null,'cancelled'],[409,{},'rejected'],[408,{},'unknown'],[503,{},'unknown'],[200,{},'unknown'],[200,p,'confirmed']]){
  let calls=0;assert.equal((await readChatTextChange(async()=>{calls++;return Response.json(value,{status});},'PATCH',id,channel,body)).kind,kind);assert.equal(calls,1);
 }
 assert.equal((await readChatTextChange(async()=>{throw Error('offline');},'PATCH',id,channel,body)).kind,'unknown');
 for(const locale of ['bn','en']){assert.equal(chatTextFeedback('/api/chat-messages/'+id,503,{},locale).kind,'info');assert.equal(chatTextFeedback('/api/chat-messages/'+id,403,{code:'CHAT_TEXT_FORBIDDEN'},locale).kind,'error');assert.equal(chatTextActionCopy('/api/chat-messages/'+id,'DELETE',locale).destructive,true);assert.equal(chatTextFeedback('/api/chat',503,{},locale),null);for(const code of ['CHAT_TEXT_CHANGED','CHAT_TEXT_HAS_FILES','CHAT_TEXT_UNKNOWN','CHAT_TEXT_PENDING'])assert.ok(chatTextCopy(code,locale));}
});
test('authoritative snapshots replace deleted messages; old stream batches cannot resurrect or downgrade edits',()=>{
 const old=chatMessagePublic(row,true),newer={...old,body:'Edited',edited_at:edited},removed=new Set();
 assert.deepEqual(reconcileChatMessages([newer],[old],removed),[newer]);assert.deepEqual(reconcileChatMessages([old],[],removed,true),[]);assert.equal(removed.has(id),true);assert.deepEqual(reconcileChatMessages([], [old],removed),[]);
 assert.deepEqual(reconcileChatMessages([], [newer],removed,true),[newer]);
});
test('complete feed validates bounds, unique IDs, channel links, metadata, and public projection',()=>{
 const snapshot={channel:{id:channel},messages:[chatMessagePublic(row,true)],reactions:[],attachments:[]};assert.ok(chatFeedSnapshot(snapshot,channel));
 for(const patch of [{channel:{id:other}},{messages:[snapshot.messages[0],snapshot.messages[0]]},{messages:[{...snapshot.messages[0],is_mine:'true'}]},{reactions:[{id:other,message_id:other,emoji:'❤️',created_at:stamp,is_mine:true}]},{attachments:[{id:other,message_id:id,channel_id:other,file_name:'QA',mime_type:'image/png',file_size:1,created_at:stamp}]}])assert.equal(chatFeedSnapshot({...snapshot,...patch},channel),null);
 assert.equal(chatFeedSnapshot({...snapshot,messages:Array(151).fill(snapshot.messages[0])},channel),null);
});
test('route and UI/modal wiring protects files, scope, explicit verification, stale responses and editor draft',()=>{
 const route=readFileSync(new URL('../app/api/chat-messages/[id]/route.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/family-chat.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 for(const [name,source,kind]of [['route.ts',route,ts.ScriptKind.TS],['chat.tsx',ui,ts.ScriptKind.TSX],['modal.tsx',provider,ts.ScriptKind.TSX]])assert.equal(ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,kind).parseDiagnostics.length,0);
 for(const marker of ['getActiveFamilyMembership','getAccessibleChatChannel','family_id:`eq.${membership.family_id}`','auth_user_id:`eq.${user.userId}`','message_type:"eq.text"','edited_at:row.edited_at===null?"is.null"','CHAT_TEXT_HAS_FILES','chatTextWrite'])assert.ok(route.includes(marker),marker);
 for(const marker of ['if(response.status===499)','if (verifyChannel)','if(await loadMessages(verifyChannel,false,true))','epoch!==feedEpoch.current','removedText.current.add(message.id)','Close editor','reconcileChatMessages','chatFeedSnapshot','setTextEdit(current=>current?.original.id===message.id?null:current)'])assert.ok(ui.includes(marker),marker);
 assert.ok(provider.includes('chatTextActionCopy(pathname, method, locale)'));assert.ok(provider.includes('chatTextResult'));assert.ok(provider.includes('pathname.startsWith("/api/event-comments/")'));
 assert.ok(!route.includes('bucket.delete'));
});
