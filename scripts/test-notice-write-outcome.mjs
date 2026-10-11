import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { noticeWrite, noticeWriteResponse, noticeMutationAcknowledged, noticePublicRow, noticeWriteFeedback, readNoticeMutation, noticeReadSnapshot, NoticeRequestGate, NoticeWriteOutcomeUnknownError, NoticeWriteRejectedError } from '../lib/notice-write-outcome.ts';
import { NoticeValidationError, noticeErrorCopy } from '../lib/notice-validation.ts';
const id='20000000-0000-4000-8000-000000000010', other='20000000-0000-4000-8000-000000000011', family='20000000-0000-4000-8000-000000000002';
const row={id,title_bn:'QA notice',title_en:null,body_bn:'Synthetic notice only.',body_en:null,category:'general',priority:'normal',status:'draft',is_pinned:false,publish_at:null,expires_at:null,created_at:'2026-10-11T10:00:00Z',updated_at:'2026-10-11T10:00:00Z'};
const opts=patch=>({write:async()=>[row],audit:async()=>{},confirmedRejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...patch});
const payload=notice=>({success:true,id,notice});
const actions=[['POST',undefined,{status:'draft',isPinned:false},201,row],['PATCH',id,{action:'edit',data:{status:'draft',isPinned:false}},200,row],['PATCH',id,{action:'publish'},200,{...row,status:'published'}],['PATCH',id,{action:'draft'},200,row],['PATCH',id,{action:'archive'},200,{...row,status:'archived'}],['PATCH',id,{action:'pin'},200,{...row,is_pinned:true}],['PATCH',id,{action:'unpin'},200,row],['DELETE',id,{},200,null]];
test('every notice write confirms one returned record before auditing, with typed acknowledgement',async()=>{
 for(const [method,expectedId,body,status,notice]of actions){const order=[];const result=await noticeWrite(opts({expectedId,deletion:method==='DELETE',write:async()=>{order.push('write');return[notice??{id}];},audit:async saved=>{assert.equal(saved,id);order.push('audit');}}));assert.deepEqual(order,['write','audit']);const response=noticeWriteResponse(result,status);assert.equal(response.status,status);assert.equal(noticeMutationAcknowledged(method,expectedId,body,status,await response.json()),true);}
});
test('confirmed audit failure is 202 saved/pending, never retry, rollback or false failure',async()=>{
 for(const [method,expectedId,body,status,notice]of actions){let writes=0,audits=0;const result=await noticeWrite(opts({expectedId,deletion:method==='DELETE',write:async()=>{writes++;return[notice??{id}];},audit:async()=>{audits++;throw Error('simulated audit outage');}}));assert.deepEqual([writes,audits],[1,1]);assert.equal(result.auditPending,true);const response=noticeWriteResponse(result,status),p=await response.json();assert.equal(response.status,202);assert.equal(noticeMutationAcknowledged(method,expectedId,body,202,p),true);for(const locale of ['bn','en'])assert.equal(noticeWriteFeedback('/api/notices'+(expectedId?'/'+expectedId:''),202,p,locale,method,body).kind,'info');}
});
test('empty conditional match conflicts; malformed/create-empty/wrong/multiple rows are unknown without phantom audit',async()=>{
 let audits=0;await assert.rejects(noticeWrite(opts({expectedId:id,write:async()=>[],audit:async()=>audits++})),e=>e instanceof NoticeValidationError&&e.code==='NOTICE_RECORD_CHANGED');
 for(const result of [null,undefined,{},[],[{}],[{id:'bad'}],[{...row,id:other}],[row,row],[{...row,status:['draft']}],[{...row,updated_at:'bad'}]])await assert.rejects(noticeWrite(opts({expectedId:result?.length===0?undefined:id,write:async()=>result,audit:async()=>audits++})),NoticeWriteOutcomeUnknownError);
 assert.equal(audits,0);
});
test('transport, timeout and server ambiguity differs from known database rejection, without retry',async()=>{
 for(const error of [Error('lost reply'),{status:408},{status:502},{status:409}]){let writes=0,audits=0;await assert.rejects(noticeWrite(opts({write:async()=>{writes++;throw error;},audit:async()=>audits++})),error.status===409?NoticeWriteRejectedError:NoticeWriteOutcomeUnknownError);assert.deepEqual([writes,audits],[1,0]);}
});
test('public acknowledgement projects allowed fields and rejects invalid dates, text, enums and boolean coercion',()=>{
 assert.deepEqual(noticePublicRow({...row,family_id:family,created_by_user_id:'private',object_key:'secret'}),row);
 for(const bad of [null,[],{...row,is_pinned:'false'},{...row,priority:['normal']},{...row,status:['draft']},{...row,publish_at:'2026-02-30T10:00Z'},{...row,created_at:null},{...row,body_en:true},{...row,body_bn:'x'},{...row,expires_at:undefined}])assert.equal(noticePublicRow(bad),null);
});
test('typed acknowledgements reject wrong IDs/statuses/flags, malformed 2xx and false pending outcomes',()=>{
 for(const bad of [null,[],{},payload({...row,id:other}),{...payload(row),id:other},{...payload(row),success:'true'},{...payload(row),auditPending:'true'},{...payload(row),outcomeUnknown:true},payload({...row,status:'published'})])assert.equal(noticeMutationAcknowledged('POST',undefined,{status:'draft'},201,bad),false);
 assert.equal(noticeMutationAcknowledged('PATCH',id,{action:['draft']},200,payload(row)),false);
 assert.equal(noticeMutationAcknowledged('DELETE',id,{},200,{success:true,id:other}),false);
 assert.equal(noticeMutationAcknowledged('DELETE',undefined,{},200,{success:true,id}),false);
 assert.equal(noticeMutationAcknowledged('POST',undefined,{},202,payload(row)),false);
 assert.equal(noticeMutationAcknowledged('POST',undefined,{},201,{...payload(row),auditPending:true}),false);
 assert.equal(noticeMutationAcknowledged('POST',undefined,{},202,{...payload(row),auditPending:true,code:'wrong'}),false);
});
test('client parsing preserves cancel/rejection and treats lost/malformed/server replies as unknown',async()=>{
 const cases=[[499,{error:'cancel'},'cancelled'],[409,{code:'NOTICE_RECORD_CHANGED'},'rejected'],[503,{},'unknown'],[408,{},'unknown'],[201,null,'unknown'],[201,[], 'unknown'],[201,payload(row),'confirmed'],[202,{...payload(row),auditPending:true,code:'NOTICE_AUDIT_PENDING'},'confirmed']];
 for(const [status,value,kind]of cases){let calls=0;assert.equal((await readNoticeMutation(async()=>{calls++;return Response.json(value,{status});},'POST',undefined,{})).kind,kind);assert.equal(calls,1);}
 assert.equal((await readNoticeMutation(async()=>new Response('broken',{status:201}),'POST',undefined,{})).kind,'unknown');
 assert.equal((await readNoticeMutation(async()=>{throw Error('offline');},'POST',undefined,{})).kind,'unknown');
});
test('bilingual specific feedback never offers blind retry and ignores other API modules',()=>{
 for(const locale of ['bn','en']){for(const code of ['NOTICE_WRITE_OUTCOME_UNKNOWN','NOTICE_AUDIT_PENDING','NOTICE_WRITE_REJECTED','NOTICE_INVALID_SNAPSHOT'])assert.ok(noticeErrorCopy(code,locale));assert.equal(noticeWriteFeedback('/api/notices',201,{},locale,'POST',{}).kind,'info');assert.equal(noticeWriteFeedback('/api/notices/'+id,503,{},locale).kind,'info');assert.equal(noticeWriteFeedback('/api/events',503,{},locale),null);assert.equal(noticeWriteFeedback('/api/notices',400,{},locale),null);}
});
test('verification accepts only a complete scoped snapshot, including legitimate empty lists',()=>{
 const snapshot={family:{id:family,name_bn:'QA family',name_en:null},notices:[{...row,family_id:family}],permissions:{canManage:true},migrationRequired:false};assert.deepEqual(noticeReadSnapshot(snapshot).notices,[row]);assert.deepEqual(noticeReadSnapshot({...snapshot,notices:[]}).notices,[]);
 for(const bad of [null,{}, {...snapshot,family:null},{...snapshot,permissions:{canManage:'true'}},{...snapshot,migrationRequired:undefined},{...snapshot,notices:[row,row]},{...snapshot,notices:[{...row,family_id:other}]},{...snapshot,notices:[{...row,is_pinned:1}]}])assert.equal(noticeReadSnapshot(bad),null);
});
test('stale/unmounted reads cannot unlock verification and all mutation entry points share the guard',()=>{
 const gate=new NoticeRequestGate(),old=gate.begin(),fresh=gate.begin();assert.equal(old.controller.signal.aborted,true);assert.equal(gate.current(old),false);assert.equal(gate.current(fresh),true);gate.cancel();assert.equal(gate.current(fresh),false);assert.equal(fresh.controller.signal.aborted,true);
 const center=readFileSync(new URL('../app/notice-center.tsx',import.meta.url),'utf8'),modal=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 const collection=readFileSync(new URL('../app/api/notices/route.ts',import.meta.url),'utf8');assert.ok(collection.includes('const snapshot = noticeReadSnapshot({'));assert.ok(collection.includes('return Response.json(snapshot)'));
 assert.ok(center.includes('gate.blocked || gate.busy'));assert.equal((center.match(/await mutateNotice\(/g)||[]).length,4);assert.ok(center.includes('if (await loadNotices())'));assert.ok(center.includes('setVerificationBlocked(false)'));assert.ok(center.includes('if (!outcome.auditPending) setFeedback'));assert.ok(center.includes('requestGate.current.current(ticket)'));assert.ok(center.includes('25000'));assert.ok(center.includes('<fieldset disabled={saving || loading || verificationBlocked}'));assert.ok(modal.includes('const nextResult = noticeResult ??'));assert.ok(modal.includes('const noticeFailure = noticeWriteFeedback'));
});
