import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {canDeleteEventMedia,eventMediaDeleteAllowed} from '../lib/event-media-access.ts';
import {eventMediaPublicRow,eventMediaUploadWrite,eventMediaResponse} from '../lib/event-media-workflow.ts';
import {eventSafeSnapshot} from '../lib/event-read.ts';
import {eventErrorCopy} from '../lib/event-validation.ts';
import {eventActionCopy} from '../lib/event-action-copy.ts';
const family='20000000-0000-4000-8000-000000000002',parent='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000011',stamp='2026-10-13T10:00:00Z';
const raw={id,family_id:family,event_id:parent,uploaded_by_user_id:'qa-owner',storage_key:`families/${family}/events/${parent}/${id}.png`,file_name:'QA.png',mime_type:'image/png',file_size:68,caption:'QA caption',uploader_name:'Same display name',created_at:stamp};
test('server authorization uses exact stored identity: own or admin, never display names or truthy roles',()=>{
 for(const admin of [false,true]){assert.equal(canDeleteEventMedia('qa-owner','qa-owner',admin),true);assert.equal(canDeleteEventMedia('qa-owner','someone-else',admin),admin);}
 for(const value of [null,undefined,0,[],{},'', ' ']){assert.equal(canDeleteEventMedia(value,'qa-owner',true),false);assert.equal(canDeleteEventMedia('qa-owner',value,true),false);}
 for(const value of ['true',1,null,undefined])assert.equal(canDeleteEventMedia('qa-owner','different',value),false);
 assert.equal(canDeleteEventMedia('qa-owner','QA-OWNER',false),false);
});
test('member controls require explicit own boolean; legacy/inherited flags and matching names grant nothing',()=>{
 assert.equal(eventMediaDeleteAllowed({...raw,is_current_user:true},false),true);assert.equal(eventMediaDeleteAllowed({...raw,is_current_user:false},false),false);
 assert.equal(eventMediaDeleteAllowed(raw,false),false);assert.equal(eventMediaDeleteAllowed(raw,true),true);
 assert.equal(eventMediaDeleteAllowed(Object.create({is_current_user:true}),false),false);
 for(const value of ['true',1,null])for(const admin of [true,false])assert.equal(eventMediaDeleteAllowed({...raw,is_current_user:value},admin),false);
 for(const value of [null,[],true,'bad'])assert.equal(eventMediaDeleteAllowed(value,true),false);
 assert.equal(eventMediaDeleteAllowed({is_current_user:true},'false'),false);
});
test('projection preserves explicit ownership but excludes uploader account, family and object key',()=>{
 for(const own of [true,false,undefined]){const safe=eventMediaPublicRow(raw,own);assert.ok(safe);assert.equal(safe.is_current_user,own);for(const field of ['uploaded_by_user_id','storage_key','family_id'])assert.equal(Object.hasOwn(safe,field),false);}
 assert.equal(eventMediaPublicRow({...raw,is_current_user:true}).is_current_user,true);
 for(const flag of ['true',1,null])assert.equal(eventMediaPublicRow({...raw,is_current_user:flag}),null);
});
test('safe read propagates own/non-own/legacy flags; malformed flags fail the whole snapshot',()=>{
 const event={id:parent,title_bn:'QA event',title_en:null,description_bn:'Synthetic fixture only.',description_en:null,event_type:'meeting',start_at:stamp,end_at:null,venue:'QA Hall',city:null,meeting_point:null,estimated_cost_per_person:0,total_budget:0,capacity:null,registration_deadline:null,status:'published',created_at:stamp,updated_at:stamp};
 const snapshot={family:{id:family,name_bn:'পরীক্ষা পরিবার',name_en:null},events:[event],rsvps:[],comments:[],media:[raw],permissions:{canManage:false},migrationRequired:false};
 for(const own of [true,false,undefined]){
  const media=eventMediaPublicRow(raw,own),safe=eventSafeSnapshot({...snapshot,media:[media]});assert.ok(safe);assert.equal(safe.media[0].is_current_user,own);assert.equal(eventMediaDeleteAllowed(safe.media[0],false),own===true);
 }
 for(const flag of ['true',1,null])assert.equal(eventSafeSnapshot({...snapshot,media:[{...raw,is_current_user:flag}]}),null);
});
test('confirmed upload returns own flag immediately; no reload or account ID exposure needed',async()=>{
 const result=await eventMediaUploadWrite({familyId:family,eventId:parent,actorId:'qa-owner',key:raw.storage_key,file:{name:raw.file_name,type:raw.mime_type,size:raw.file_size,extension:'png'},caption:raw.caption,
  put:async()=>{},create:async()=>[raw],discard:async()=>assert.fail('unsafe cleanup'),confirmedRejected:()=>false,audit:async()=>{}});
 const response=eventMediaResponse(result),p=await response.json();assert.equal(response.status,201);assert.equal(p.media.is_current_user,true);assert.equal(eventMediaDeleteAllowed(p.media,false),true);assert.equal(Object.hasOwn(p.media,'uploaded_by_user_id'),false);
});
test('API read projects ownership and deletion reauthorizes from stored account/membership, not client flags',()=>{
 const read=readFileSync(new URL('../app/api/events/route.ts',import.meta.url),'utf8'),remove=readFileSync(new URL('../app/api/event-media/[id]/route.ts',import.meta.url),'utf8');
 for(const marker of ['created_at,uploaded_by_user_id','eventMediaPublicRow(item, item.uploaded_by_user_id === user.userId)','if (!row) throw'])assert.ok(read.includes(marker),marker);
 for(const marker of ['getActiveFamilyMembership(user.userId)','family_id: `eq.${membership.family_id}`','canDeleteEventMedia(media.uploaded_by_user_id, user.userId, canManageEvents(membership.role))','uploaded_by_user_id: `eq.${media.uploaded_by_user_id}`'])assert.ok(remove.includes(marker),marker);
 assert.ok(!remove.includes('request.json()'));
});
test('gallery and handler share ownership controls; confirmations, closeable feedback and guides remain bilingual',()=>{
 const source=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8'),help=readFileSync(new URL('../app/help-center.tsx',import.meta.url),'utf8');
 assert.equal(ts.createSourceFile('event.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);
 for(const marker of ['eventMediaDeleteAllowed(item, canManage) ? <Button','eventMediaDeleteAllowed(item, access.current.canManage)','Delete your media','Remove media as admin','EVENT_MEDIA_DELETE_FORBIDDEN'])assert.ok(source.includes(marker),marker);
 const handler=source.slice(source.indexOf('  async function deleteMedia(id: string) {'),source.indexOf('\n  useEffect(',source.indexOf('  async function deleteMedia(id: string) {')));
 assert.ok(handler.indexOf('eventMediaDeleteAllowed')<handler.indexOf('mutateMedia("DELETE"'));assert.ok(handler.includes('!access.current.ready || access.current.blocked || access.current.busy'));
 for(const locale of ['bn','en']){assert.ok(eventErrorCopy('EVENT_MEDIA_DELETE_FORBIDDEN',locale));assert.equal(eventActionCopy('/api/event-media/'+id,'DELETE',{},locale).destructive,true);}
 assert.ok(help.includes('delete your uploads'));assert.ok(help.includes('অন্যের লেখা বদলাতে পারবেন না'));assert.ok(help.includes('Reload to verify'));
});
