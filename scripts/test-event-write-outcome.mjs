import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {eventRecord,EventValidationError} from '../lib/event-validation.ts';
import {eventWrite,eventWriteResponse,eventMutationAcknowledged,eventPublicRow,eventReadSnapshot,eventCapturedMediaKeys,eventWriteFeedback,readEventMutation,EventWriteOutcomeUnknownError,EventWriteRejectedError} from '../lib/event-write-outcome.ts';
import {eventActionCopy} from '../lib/event-action-copy.ts';
const id='20000000-0000-4000-8000-000000000010',other='20000000-0000-4000-8000-000000000011',family='20000000-0000-4000-8000-000000000002';
const data={titleBn:'QA event',descriptionBn:'Synthetic event only.',venue:'QA location',startAt:'2027-01-01T12:00:00+06:00',status:'draft'};
const row={id,...eventRecord(data),created_at:'2026-10-12T10:00:00Z',updated_at:'2026-10-12T10:00:00Z'};
const opts=patch=>({write:async()=>[row],audit:async()=>{},confirmedRejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...patch});
const payload=event=>({success:true,id,event});
const actions=[['POST',undefined,data,201,row],['PATCH',id,{action:'edit',data},200,row],...Object.entries({publish:'published',close:'registration_closed',complete:'completed',cancel:'cancelled',draft:'draft'}).map(([action,status])=>['PATCH',id,{action},200,{...row,status}]),['DELETE',id,{},200,null]];
test('every ordinary event write confirms one row before one audit and typed acknowledgement',async()=>{
 for(const [method,expectedId,body,status,event]of actions){const order=[];const r=await eventWrite(opts({expectedId,deletion:method==='DELETE',write:async()=>{order.push('write');return[event??{id}];},audit:async saved=>{assert.equal(saved,id);order.push('audit');}}));assert.deepEqual(order,['write','audit']);const response=eventWriteResponse(r,status);assert.equal(response.status,status);assert.equal(eventMutationAcknowledged(method,expectedId,body,status,await response.json()),true);}
});
test('confirmed audit and captured-file cleanup failures return independent 202 flags without rollback/retry',async()=>{
 for(const [auditFail,cleanupFail]of [[true,false],[false,true],[true,true]]){let writes=0,audits=0,cleanups=0;const r=await eventWrite(opts({expectedId:id,deletion:true,write:async()=>{writes++;return[{id}];},cleanup:async()=>{cleanups++;if(cleanupFail)throw Error('simulated cleanup');},audit:async()=>{audits++;if(auditFail)throw Error('simulated audit');}}));assert.deepEqual([writes,audits,cleanups],[1,1,1]);assert.equal(r.auditPending,auditFail);assert.equal(r.cleanupPending,cleanupFail);const response=eventWriteResponse(r);assert.equal(response.status,202);assert.equal(eventMutationAcknowledged('DELETE',id,{},202,await response.json()),true);}
 const r=await eventWrite(opts({audit:async()=>{throw Error('simulated audit');}}));assert.equal(eventMutationAcknowledged('POST',undefined,data,202,await eventWriteResponse(r,201).json()),true);
});
test('empty conditional matches conflict; missing/malformed/multiple/wrong identities do not audit or clean up',async()=>{
 let calls=0;await assert.rejects(eventWrite(opts({expectedId:id,write:async()=>[],audit:async()=>calls++,cleanup:async()=>calls++})),e=>e instanceof EventValidationError&&e.code==='EVENT_RECORD_CHANGED');
 for(const result of [null,undefined,{},[],[{}],[{id:'bad'}],[{...row,id:other}],[row,row],[{...row,status:['draft']}],[{...row,total_budget:'1.001'}]])await assert.rejects(eventWrite(opts({expectedId:result?.length===0?undefined:id,write:async()=>result,audit:async()=>calls++,cleanup:async()=>calls++})),EventWriteOutcomeUnknownError);assert.equal(calls,0);
});
test('timeout/lost/server write acknowledgement is unknown; confirmed 4xx rejection is distinct with no retry',async()=>{
 for(const error of [Error('lost reply'),{status:408},{status:502},{status:409}]){let calls=0;await assert.rejects(eventWrite(opts({write:async()=>{calls++;throw error;},audit:async()=>assert.fail('phantom audit')})),error.status===409?EventWriteRejectedError:EventWriteOutcomeUnknownError);assert.equal(calls,1);}
});
test('event projection strips identities and refuses invalid public row fields',()=>{
 assert.deepEqual(eventPublicRow({...row,family_id:family,created_by_user_id:'private',storage_key:'private'}),row);
 for(const value of [null,{...row,capacity:'2'},{...row,total_budget:null},{...row,start_at:'bad'},{...row,updated_at:null},{...row,venue:true},{...row,title_bn:'x'.repeat(181)},{...row,end_at:''}])assert.equal(eventPublicRow(value),null);
});
test('client acknowledgement rejects false success/IDs/status/flags and malformed 2xx, cancellation is no-op',async()=>{
 for(const event of [{...row,title_bn:'Different saved title'},{...row,total_budget:1.01},{...row,start_at:'2099-01-01T00:00:00Z'}])assert.equal(eventMutationAcknowledged('POST',undefined,data,201,payload(event)),false);
 for(const value of [null,[],{},payload({...row,id:other}),{...payload(row),id:other},{...payload(row),success:'true'},{...payload(row),auditPending:'true'},{...payload(row),cleanupPending:true},payload({...row,status:'published'})])assert.equal(eventMutationAcknowledged('POST',undefined,data,201,value),false);
 for(const [status,value,kind]of [[499,null,'cancelled'],[409,{code:'EVENT_RECORD_CHANGED'},'rejected'],[503,{},'unknown'],[408,{},'unknown'],[201,null,'unknown'],[201,payload(row),'confirmed']]){let calls=0;assert.equal((await readEventMutation(async()=>{calls++;return Response.json(value,{status});},'POST',undefined,data)).kind,kind);assert.equal(calls,1);}
 assert.equal((await readEventMutation(async()=>new Response('broken',{status:201}),'POST',undefined,data)).kind,'unknown');assert.equal((await readEventMutation(async()=>{throw Error('offline');},'POST',undefined,data)).kind,'unknown');
 assert.equal(eventMutationAcknowledged('PATCH',id,{action:['draft']},200,payload(row)),false);assert.equal(eventMutationAcknowledged('DELETE',id,{},200,{success:true,id:other}),false);assert.equal(eventMutationAcknowledged('POST',undefined,data,202,payload(row)),false);
});
test('capture checks both family/event boundaries and generated filenames before any irreversible deletion',()=>{
 const key=`families/${family}/events/${id}/${other}.png`;assert.deepEqual(eventCapturedMediaKeys([{storage_key:key},{storage_key:key}],family,id),[key]);
 for(const rows of [null,[{}],[{storage_key:key.replace(family,other)}],[{storage_key:key.replace('/events/'+id,'/events/'+other)}],[{storage_key:key+'/extra'}],[{storage_key:'../private'}]])assert.throws(()=>eventCapturedMediaKeys(rows,family,id),e=>e.code==='EVENT_DELETE_UNAVAILABLE');
});
test('reload validates full child arrays/links/booleans/scopes and strips all child auth/storage identities',()=>{
 const rsvp={id:other,event_id:id,is_current_user:true,respondent_name:'QA owner',response:'going',guest_count:0,note:null,updated_at:row.updated_at},comment={id:other,event_id:id,author_name:'QA owner',body:'QA comment',created_at:row.created_at},media={id:other,event_id:id,file_name:'qa.png',mime_type:'image/png',file_size:1,caption:null,uploader_name:'QA owner',created_at:row.created_at};
 const raw={family:{id:family,name_bn:'QA family',name_en:null},events:[row],rsvps:[{...rsvp,auth_user_id:'private'}],comments:[{...comment,auth_user_id:'private'}],media:[{...media,storage_key:'private'}],permissions:{canManage:true},migrationRequired:false};
 const s=eventReadSnapshot(raw,family);assert.deepEqual(s.rsvps,[rsvp]);assert.deepEqual(s.comments,[comment]);assert.deepEqual(s.media,[media]);
 for(const bad of [null,{}, {...raw,permissions:{canManage:'true'}},{...raw,events:[row,row]},{...raw,rsvps:[{...rsvp,event_id:family}]},{...raw,comments:null},{...raw,media:[{...media,file_size:'1'}]},{...raw,migrationRequired:true}])assert.equal(eventReadSnapshot(bad),null);assert.equal(eventReadSnapshot(raw,other),null);
 assert.ok(eventReadSnapshot({...raw,events:[],rsvps:[],comments:[],media:[]}));
});
test('specific bilingual close-X feedback covers pending/unknown but not child endpoints; action copy rejects prototype keys',()=>{
 for(const locale of ['bn','en']){assert.equal(eventWriteFeedback('/api/events',201,{},locale,'POST',data).kind,'info');assert.equal(eventWriteFeedback('/api/events/'+id,503,{},locale).kind,'info');assert.equal(eventWriteFeedback('/api/events/'+id,202,{success:true,id,auditPending:true,cleanupPending:false,code:'EVENT_WRITE_PENDING'},locale,'DELETE',{}).kind,'info');assert.equal(eventWriteFeedback('/api/events/'+id+'/comments',503,{},locale),null);for(const action of ['constructor','__proto__','toString'])assert.equal(eventActionCopy('/api/events/'+id,'PATCH',{action},locale),null);}
});
test('route/client/provider wiring preserves scope/CAS and guarded UI/WebMCP/auxiliary entry points',()=>{
 const item=readFileSync(new URL('../app/api/events/[id]/route.ts',import.meta.url),'utf8'),center=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 assert.equal((item.match(/scopedQuery\(id, membership.family_id, existing\)/g)||[]).length,2);assert.ok(item.includes('eventCapturedMediaKeys(media, membership.family_id, existing.id)'));assert.ok(item.includes('maxRows: 20000'));assert.ok(!item.includes('.delete(media.storage_key).catch'));
 const parsed=ts.createSourceFile('event.tsx',center,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(parsed.parseDiagnostics.length,0);const component=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='EventCenter');assert.ok(component.body.getText(parsed).includes('verifyEventOutcome'));
 assert.equal((center.match(/await mutateEvent\(/g)||[]).length,4);assert.ok(center.includes('gate.blocked || gate.busy'));assert.ok(center.includes('if (await loadEvents())'));assert.ok(center.includes('eventReadSnapshot(raw, readFamily.current)'));assert.ok(center.includes('setVerificationBlocked(false)'));assert.ok(center.includes('if (!outcome.pending) setFeedback'));assert.ok(center.includes('onClick={() => void verifyEventOutcome()}'));
 assert.ok(center.includes('await mutateMedia("POST",'));assert.ok(center.includes('await mutateMedia("DELETE",'));assert.ok(center.includes('if (!beginAuxiliary()) return null;'));
 assert.ok(center.includes('await mutateParticipation("rsvp",'));assert.ok(center.includes('await mutateParticipation("comment",'));assert.ok(center.includes('if (!beginAuxiliary()) return null;'));
 assert.ok(provider.includes('eventWriteFeedback(url.pathname'));assert.ok(provider.includes('eventErrorCopy(payload.code, locale)'));
});
