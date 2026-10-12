import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {eventCommentChangeRecord,eventCommentMayChange,eventCommentFilterText,eventCommentChangeWrite,eventCommentChangeResponse,eventCommentChangeAcknowledged,eventCommentChangeFeedback,readEventCommentChange} from '../lib/event-comment-management.ts';
import {eventCommentPublicRow} from '../lib/event-participation.ts';
import {eventSafeSnapshot} from '../lib/event-read.ts';
import {eventActionCopy} from '../lib/event-action-copy.ts';
import {eventErrorCopy,EventValidationError} from '../lib/event-validation.ts';
import {EventWriteOutcomeUnknownError,EventWriteRejectedError} from '../lib/event-write-outcome.ts';
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000011',parentId='20000000-0000-4000-8000-000000000010',other='20000000-0000-4000-8000-000000000012',stamp='2026-10-12T10:00:00Z';
const row={id,family_id:family,event_id:parentId,auth_user_id:'qa-owner',author_name:'QA author',body:'Original QA text',created_at:stamp};
const body={body:'Updated QA text',expectedBody:row.body};
const options=(method,extra={})=>({method,row,actorId:'qa-owner',body:body.body,write:async()=>[{...row,body:method==='PATCH'?body.body:row.body}],audit:async()=>{},confirmedRejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
const response=async(method,extra={})=>eventCommentChangeResponse(await eventCommentChangeWrite(options(method,extra)));
test('strict changes require exact untrimmed original text and bound new body without coercion/truncation',()=>{
 assert.deepEqual(eventCommentChangeRecord('PATCH',{body:' Updated text ',expectedBody:' Original '}),{body:'Updated text',expectedBody:' Original '});
 assert.deepEqual(eventCommentChangeRecord('DELETE',{expectedBody:row.body}),{expectedBody:row.body});
 for(const value of [null,[],true,'text',{expectedBody:row.body,auth_user_id:'spoof'},{expectedBody:row.body,eventId:parentId}])assert.throws(()=>eventCommentChangeRecord('DELETE',value),EventValidationError);
 for(const value of [null,true,[],{},'', 'x','x'.repeat(2001)])assert.throws(()=>eventCommentChangeRecord('PATCH',{...body,expectedBody:value}),e=>e.code==='EVENT_COMMENT_VERSION_REQUIRED');
 for(const value of [null,true,[],'x','x'.repeat(2001)])assert.throws(()=>eventCommentChangeRecord('PATCH',{...body,body:value}),EventValidationError);
 assert.throws(()=>eventCommentChangeRecord('DELETE',body),EventValidationError);
});
test('only author edits; author/admin deletes; member draft and unknown/cross-parent fail closed',()=>{
 for(const status of ['published','registration_closed','completed','cancelled']){
  const parent={id:parentId,status};for(const admin of [false,true]){
   assert.equal(eventCommentMayChange('PATCH',row,parent,'qa-owner',admin),true);
   assert.equal(eventCommentMayChange('PATCH',row,parent,'someone-else',admin),false);
   assert.equal(eventCommentMayChange('DELETE',row,parent,'qa-owner',admin),true);
   assert.equal(eventCommentMayChange('DELETE',row,parent,'someone-else',admin),admin);
  }
 }
 assert.equal(eventCommentMayChange('DELETE',row,{id:parentId,status:'draft'},'admin',true),true);
 assert.equal(eventCommentMayChange('DELETE',row,{id:parentId,status:'draft'},'qa-owner',false),false);
 assert.equal(eventCommentMayChange('PATCH',row,{id:parentId,status:'draft'},'qa-owner',true),false);
 for(const parent of [null,{id:other,status:'published'},{id:parentId,status:'unknown'}])assert.equal(eventCommentMayChange('DELETE',row,parent,'qa-owner',true),false);
 assert.equal(eventCommentMayChange('PATCH',{...row,auth_user_id:null},{id:parentId,status:'published'},'qa-owner',true),false);
});
test('ownership flag is safe boolean projection; absent legacy flag grants no UI ownership',()=>{
 const own=eventCommentPublicRow(row,true),foreign=eventCommentPublicRow(row,false),legacy=eventCommentPublicRow(row);
 assert.equal(own.is_current_user,true);assert.equal(foreign.is_current_user,false);assert.equal(legacy.is_current_user,undefined);
 for(const value of [own,foreign,legacy]){assert.equal(Object.hasOwn(value,'auth_user_id'),false);assert.equal(Object.hasOwn(value,'family_id'),false);}
 for(const flag of ['true',1,null])assert.equal(eventCommentPublicRow({...row,is_current_user:flag}),null);
 const event={id:parentId,title_bn:'QA event',title_en:null,description_bn:'Synthetic fixture only.',description_en:null,event_type:'meeting',start_at:stamp,end_at:null,venue:'QA Hall',city:null,meeting_point:null,estimated_cost_per_person:0,total_budget:0,capacity:null,registration_deadline:null,status:'published',created_at:stamp,updated_at:stamp};
 const snapshot={family:{id:family,name_bn:'পরীক্ষা পরিবার',name_en:null},events:[event],rsvps:[],comments:[own],media:[],permissions:{canManage:true},migrationRequired:false};
 assert.equal(eventSafeSnapshot(snapshot).comments[0].is_current_user,true);
 for(const flag of ['true',1,null])assert.equal(eventSafeSnapshot({...snapshot,comments:[{...own,is_current_user:flag}]}),null);
});
test('single-column CAS eq preserves punctuation/backslashes/quotes/unicode without literal wrapper quotes',()=>{
 const text='বাংলা, quote:" and slash:\\ (a.b:*),\nline';
 const q=new URLSearchParams({body:eventCommentFilterText(text),family_id:'eq.'+family});
 assert.equal(new URLSearchParams(q.toString()).get('body'),'eq.'+text);
 assert.equal(q.size,2);
 const attempt=new URLSearchParams({body:eventCommentFilterText('text&family_id=eq.other&or=(id.not.is.null)')});assert.equal(attempt.size,1);assert.equal(attempt.get('body'),'eq.text&family_id=eq.other&or=(id.not.is.null)');
 assert.throws(()=>eventCommentChangeRecord('POST',body),EventValidationError);assert.equal(eventCommentMayChange('POST',row,{id:parentId,status:'published'},'qa-owner',true),false);
});
test('one confirmed scoped edit/delete precedes one audit; pending never misreports failed save',async()=>{
 for(const method of ['PATCH','DELETE'])for(const pending of [false,true]){const order=[];
  const r=await response(method,{write:async()=>{order.push('write');return[{...row,body:method==='PATCH'?body.body:row.body}];},audit:async()=>{order.push('audit');if(pending)throw Error('controlled audit failure');}});
  assert.deepEqual(order,['write','audit']);assert.equal(r.status,pending?202:200);const p=await r.json();assert.equal(eventCommentChangeAcknowledged(method,id,parentId,method==='PATCH'?body:{expectedBody:row.body},r.status,p),true);
  assert.equal(Object.hasOwn(p,'auth_user_id'),false);if(method==='PATCH'){assert.equal(p.comment.is_current_user,true);assert.equal(p.comment.author_name,row.author_name);assert.equal(p.comment.created_at,row.created_at);}
 }
 const moderated=await response('DELETE',{actorId:'different-admin'});assert.equal((await moderated.json()).deleted,true);
});
test('empty content-CAS match is conflict; ambiguous/wrong-scope/changed-field replies never audit or retry',async()=>{
 for(const method of ['PATCH','DELETE']){
  const saved={...row,body:method==='PATCH'?body.body:row.body};let audits=0;
  await assert.rejects(eventCommentChangeWrite(options(method,{write:async()=>[],audit:async()=>audits++})),e=>e.code==='EVENT_COMMENT_CHANGED');
  for(const value of [null,{},[saved,saved],[{}],...['id','family_id','event_id','auth_user_id','author_name','created_at','body'].map(key=>[{...saved,[key]:'wrong'}])])await assert.rejects(eventCommentChangeWrite(options(method,{write:async()=>value,audit:async()=>audits++})),EventWriteOutcomeUnknownError);
  assert.equal(audits,0);
  for(const error of [Error('lost reply'),{status:408},{status:502},{status:409}]){let calls=0;await assert.rejects(eventCommentChangeWrite(options(method,{write:async()=>{calls++;throw error;},audit:async()=>assert.fail('phantom audit')})),error.status===409?EventWriteRejectedError:EventWriteOutcomeUnknownError);assert.equal(calls,1);}
 }
});
test('client acknowledgements bind method/ID/parent/new body/own author and strict pending flags',async()=>{
 for(const method of ['PATCH','DELETE']){const data=method==='PATCH'?body:{expectedBody:row.body},p=await(await response(method)).json();
  for(const raw of [null,[],{}, {...p,id:other},{...p,eventId:other},{...p,success:'true'},{...p,auditPending:'true'},{...p,outcomeUnknown:true}])assert.equal(eventCommentChangeAcknowledged(method,id,parentId,data,200,raw),false);
  assert.equal(eventCommentChangeAcknowledged(method,id,parentId,data,202,p),false);
  if(method==='PATCH'){for(const patch of [{body:'wrong'},{is_current_user:false},{is_current_user:undefined},{event_id:other}])assert.equal(eventCommentChangeAcknowledged(method,id,parentId,data,200,{...p,comment:{...p.comment,...patch}}),false);}
  else for(const patch of [{deleted:'true'},{comment:{}}])assert.equal(eventCommentChangeAcknowledged(method,id,parentId,data,200,{...p,...patch}),false);
 }
});
test('cancel/rejection/unknown/pending are distinct, specific bilingual feedback avoids generic retry',async()=>{
 for(const method of ['PATCH','DELETE']){const data=method==='PATCH'?body:{expectedBody:row.body},p=await(await response(method)).json();
  for(const [status,payload,kind]of [[499,null,'cancelled'],[409,{},'rejected'],[408,{},'unknown'],[503,{},'unknown'],[200,{},'unknown'],[200,p,'confirmed']]){let calls=0;assert.equal((await readEventCommentChange(async()=>{calls++;return Response.json(payload,{status});},method,id,parentId,data)).kind,kind);assert.equal(calls,1);}
  assert.equal((await readEventCommentChange(async()=>{throw Error('offline');},method,id,parentId,data)).kind,'unknown');
  for(const locale of ['bn','en']){assert.equal(eventCommentChangeFeedback('/api/event-comments/'+id,503,{},locale).kind,'info');assert.equal(eventCommentChangeFeedback('/api/event-comments/'+id,200,{},locale,method,data).kind,'info');assert.equal(eventCommentChangeFeedback('/api/events/'+parentId+'/comments',503,{},locale),null);}
 }
 const r=await response('PATCH',{audit:async()=>{throw Error('controlled audit failure');}}),p=await r.json();for(const locale of ['bn','en'])assert.equal(eventCommentChangeFeedback('/api/event-comments/'+id,202,p,locale,'PATCH',body).kind,'info');
});
test('routes/UI/modal wiring scopes writes, prevents admin editing others, guards cancel/stale and keeps draft until confirmed',()=>{
 const center=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8'),route=readFileSync(new URL('../app/api/event-comments/[id]/route.ts',import.meta.url),'utf8');
 for(const [name,source,kind]of [['event.tsx',center,ts.ScriptKind.TSX],['modal.tsx',provider,ts.ScriptKind.TSX],['route.ts',route,ts.ScriptKind.TS]])assert.equal(ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,kind).parseDiagnostics.length,0);
 for(const marker of ['getActiveFamilyMembership(user.userId)','family_id: `eq.${membership.family_id}`','auth_user_id: eventCommentFilterText(row.auth_user_id)','body: eventCommentFilterText(record.expectedBody)','eventCommentMayChange','event_comment_moderated','eventCommentChangeWrite'])assert.ok(route.includes(marker),marker);
 for(const marker of ['comment.is_current_user','selectedComments.map(renderComment)','readEventCommentChange','if (response.status === 499)','eventCommentChangeFeedback(path, 503','requestGate.current.current(checkpoint)','current.body !== original.body','Close comment editor','if (outcome.kind === "rejected")'])assert.ok(center.includes(marker),marker);
 assert.ok(provider.includes('commentChangeResult'));assert.ok(provider.includes('commentChangeFailure'));
 for(const locale of ['bn','en']){assert.equal(eventActionCopy('/api/event-comments/'+id,'PATCH',body,locale).destructive,false);assert.equal(eventActionCopy('/api/event-comments/'+id,'DELETE',{},locale).destructive,true);for(const code of ['EVENT_COMMENT_CHANGED','EVENT_COMMENT_FORBIDDEN','EVENT_COMMENT_VERSION_REQUIRED','EVENT_COMMENT_CHANGE_UNKNOWN','EVENT_COMMENT_CHANGE_PENDING'])assert.ok(eventErrorCopy(code,locale));}
 assert.equal(eventSafeSnapshot({}),null);
});
