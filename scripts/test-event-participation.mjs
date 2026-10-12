import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {eventRsvpRecord,eventCommentRecord,eventRsvpOpen,eventCommentVisible,eventRsvpPublicRow,eventCommentPublicRow,eventParticipationWrite,eventParticipationResponse,eventParticipationAcknowledged,eventParticipationFeedback,readEventParticipation} from '../lib/event-participation.ts';
import {EventValidationError,eventErrorCopy} from '../lib/event-validation.ts';
import {EventWriteOutcomeUnknownError,EventWriteRejectedError} from '../lib/event-write-outcome.ts';
const family='20000000-0000-4000-8000-000000000002',eventId='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000020',other='20000000-0000-4000-8000-000000000021',actor='qa-owner',stamp='2026-10-12T10:00:00Z';
const rsvp={id,family_id:family,event_id:eventId,auth_user_id:actor,respondent_name:'QA owner',response:'going',guest_count:2,note:'QA note',updated_at:stamp};
const comment={id,family_id:family,event_id:eventId,auth_user_id:actor,author_name:'QA owner',body:'QA comment',created_at:stamp};
const inputs={rsvp:{response:'going',guestCount:2,note:'QA note'},comment:{body:'QA comment'}};
const opts=(kind,patch={})=>({kind,familyId:family,eventId,actorId:actor,write:async()=>[kind==='rsvp'?rsvp:comment],audit:async()=>{},confirmedRejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...patch});
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof EventValidationError&&e.code===code);
test('strict RSVP/comment inputs reject coercion/truncation and normalize only intended text',()=>{
 assert.deepEqual(eventRsvpRecord({response:'maybe'}),{response:'maybe',guest_count:0,note:null});assert.equal(eventRsvpRecord({response:'going',guestCount:'10',note:' QA '}).note,'QA');assert.equal(eventCommentRecord({body:' QA comment '}).body,'QA comment');
 for(const value of [null,[],true,'bad']){reject(()=>eventRsvpRecord(value),'EVENT_INVALID_BODY');reject(()=>eventCommentRecord(value),'EVENT_INVALID_BODY');}
 for(const value of [true,false,null,[],{},1.5,-1,11,'1e0','1.0',''])reject(()=>eventRsvpRecord({response:'going',guestCount:value}),'EVENT_RSVP_INVALID_GUESTS');
 for(const value of [null,true,[],['going'],'constructor'])reject(()=>eventRsvpRecord({response:value}),'EVENT_RSVP_INVALID_RESPONSE');
 for(const note of [true,[],{},'x'.repeat(501)])reject(()=>eventRsvpRecord({response:'going',note}),'EVENT_PARTICIPATION_INVALID_TEXT');
 for(const body of ['x','x'.repeat(2001),true,[],null])reject(()=>eventCommentRecord({body}),'EVENT_PARTICIPATION_INVALID_TEXT');
});
test('RSVP closes at the exact deadline and on unpublished states; comments preserve known non-draft discussion policy',()=>{
 const now=Date.parse(stamp);assert.equal(eventRsvpOpen({status:'published',registration_deadline:null},now),true);
 for(const deadline of [stamp,'2020-01-01T00:00Z','bad',undefined,true])assert.equal(eventRsvpOpen({status:'published',registration_deadline:deadline},now),false);
 assert.equal(eventRsvpOpen({status:'published',registration_deadline:'2026-10-12T10:00:01Z'},now),true);
 for(const status of ['draft','registration_closed','completed','cancelled'])assert.equal(eventRsvpOpen({status,registration_deadline:null},now),false);
 for(const status of ['published','registration_closed','completed','cancelled'])assert.equal(eventCommentVisible({status}),true);for(const value of [null,{status:'draft'},{status:'bad'}])assert.equal(eventCommentVisible(value),false);
});
test('safe projections exclude auth/family metadata and reject malformed child fields',()=>{
 const safeRsvp=eventRsvpPublicRow(rsvp,true),safeComment=eventCommentPublicRow(comment);for(const row of [safeRsvp,safeComment]){assert.equal(Object.hasOwn(row,'auth_user_id'),false);assert.equal(Object.hasOwn(row,'family_id'),false);}
 assert.equal(safeRsvp.is_current_user,true);assert.equal(eventRsvpPublicRow(rsvp),null);
 for(const value of [{...rsvp,guest_count:'2'},{...rsvp,note:'x'.repeat(501)},{...rsvp,updated_at:'bad'},{...rsvp,respondent_name:''}])assert.equal(eventRsvpPublicRow(value,true),null);
 for(const value of [{...comment,body:'x'},{...comment,body:'x'.repeat(2001)},{...comment,event_id:'bad'},{...comment,created_at:null}])assert.equal(eventCommentPublicRow(value),null);
});
test('one scoped child write precedes one audit; normal and audit-pending acknowledgements match the submitted record',async()=>{
 for(const kind of ['rsvp','comment'])for(const pending of [false,true]){let writes=0,audits=0;const order=[];const result=await eventParticipationWrite(opts(kind,{write:async()=>{writes++;order.push('write');return[kind==='rsvp'?rsvp:comment];},audit:async saved=>{audits++;assert.equal(saved,id);order.push('audit');if(pending)throw Error('simulated audit');}}));assert.deepEqual([writes,audits],[1,1]);assert.deepEqual(order,['write','audit']);assert.equal(result.auditPending,pending);const response=eventParticipationResponse(result),p=await response.json();assert.equal(response.status,pending?202:kind==='rsvp'?200:201);assert.equal(eventParticipationAcknowledged(kind,eventId,inputs[kind],response.status,p),true);assert.equal(Object.hasOwn(p[kind],'auth_user_id'),false);}
});
test('wrong family/event/actor, malformed or ambiguous write result never creates phantom audits or retries',async()=>{
 for(const kind of ['rsvp','comment']){let audits=0;const row=kind==='rsvp'?rsvp:comment;
 for(const value of [null,undefined,{},[],[{}],[row,row],[{...row,id:'bad'}],[{...row,family_id:other}],[{...row,event_id:other}],[{...row,auth_user_id:'another-user'}]])await assert.rejects(eventParticipationWrite(opts(kind,{write:async()=>value,audit:async()=>audits++})),EventWriteOutcomeUnknownError);assert.equal(audits,0);
 for(const error of [Error('lost reply'),{status:408},{status:502},{status:409}]){let writes=0;await assert.rejects(eventParticipationWrite(opts(kind,{write:async()=>{writes++;throw error;},audit:async()=>assert.fail('phantom audit')})),error.status===409?EventWriteRejectedError:EventWriteOutcomeUnknownError);assert.equal(writes,1);}}
});
test('client acknowledgement requires parent identity, submitted values, own RSVP and strictly typed pending flags',async()=>{
 for(const kind of ['rsvp','comment']){const result=await eventParticipationWrite(opts(kind)),p=await eventParticipationResponse(result).json(),status=kind==='rsvp'?200:201;
 for(const value of [null,[],{}, {...p,id:other},{...p,success:'true'},{...p,auditPending:'true'},{...p,outcomeUnknown:true}])assert.equal(eventParticipationAcknowledged(kind,eventId,inputs[kind],status,value),false);
 assert.equal(eventParticipationAcknowledged(kind,other,inputs[kind],status,p),false);assert.equal(eventParticipationAcknowledged(kind,eventId,inputs[kind],202,p),false);assert.equal(eventParticipationAcknowledged(kind,eventId,{...inputs[kind],...(kind==='rsvp'?{guestCount:3}:{body:'Different text'})},status,p),false);
 if(kind==='rsvp')assert.equal(eventParticipationAcknowledged(kind,eventId,inputs[kind],status,{...p,rsvp:{...p.rsvp,is_current_user:false}}),false);}
});
test('cancel/known rejection are distinct from malformed/lost/server replies and never resubmit',async()=>{
 for(const kind of ['rsvp','comment']){const good=await eventParticipationResponse(await eventParticipationWrite(opts(kind))).json();
 for(const [status,payload,expected]of [[499,null,'cancelled'],[409,{},'rejected'],[503,{},'unknown'],[408,{},'unknown'],[kind==='rsvp'?200:201,null,'unknown'],[kind==='rsvp'?200:201,good,'confirmed']]){let calls=0;assert.equal((await readEventParticipation(async()=>{calls++;return Response.json(payload,{status});},kind,eventId,inputs[kind])).kind,expected);assert.equal(calls,1);}
 assert.equal((await readEventParticipation(async()=>new Response('broken',{status:kind==='rsvp'?200:201}),kind,eventId,inputs[kind])).kind,'unknown');assert.equal((await readEventParticipation(async()=>{throw Error('offline');},kind,eventId,inputs[kind])).kind,'unknown');}
});
test('bilingual specific feedback reports unknown/pending, rejects false-success and leaves media/core paths alone',async()=>{
 for(const kind of ['rsvp','comment']){const path='/api/events/'+eventId+'/'+(kind==='rsvp'?'rsvp':'comments'),p=await eventParticipationResponse(await eventParticipationWrite(opts(kind,{audit:async()=>{throw Error('simulated audit');}}))).json();
 for(const locale of ['bn','en']){assert.equal(eventParticipationFeedback(path,202,p,locale,'POST',inputs[kind]).kind,'info');assert.equal(eventParticipationFeedback(path,503,{},locale).kind,'info');assert.equal(eventParticipationFeedback(path,kind==='rsvp'?200:201,{},locale,'POST',inputs[kind]).kind,'info');assert.equal(eventParticipationFeedback('/api/events/'+eventId+'/media',503,{},locale),null);for(const code of ['EVENT_RSVP_INVALID_GUESTS','EVENT_PARTICIPATION_INVALID_TEXT','EVENT_REGISTRATION_CLOSED','EVENT_PARTICIPATION_PENDING','EVENT_PARTICIPATION_UNKNOWN'])assert.ok(eventErrorCopy(code,locale));}}
});
test('routes and UI scope identity/parent policy, keep text until confirmation, protect unknown and invalidate exports',()=>{
 const center=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');const source=ts.createSourceFile('event.tsx',center,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(source.parseDiagnostics.length,0);
 for(const kind of ['rsvp','comments']){const route=readFileSync(new URL('../app/api/events/[id]/'+kind+'/route.ts',import.meta.url),'utf8');for(const marker of ['getActiveFamilyMembership(user.userId)','family_id: `eq.${membership.family_id}`','eventParticipationWrite','actorId: user.userId','eventParticipationResponse'])assert.ok(route.includes(marker),marker);}
 assert.ok(center.includes('await mutateParticipation("rsvp",'));assert.ok(center.includes('await mutateParticipation("comment",'));assert.ok(center.includes('eventRsvpRecord({ response: responseValue, guestCount, note: rsvpNote })'));assert.ok(!center.includes('guestCount: Number(guestCount || 0)'));assert.ok(center.includes('if (!outcome?.comment) return;'));assert.ok(center.indexOf('if (!outcome?.comment) return;')<center.indexOf('setCommentText("");'));assert.ok(center.includes('eventParticipationFeedback(path, 503'));assert.ok(center.includes('if (await loadEvents())'));assert.ok(center.includes('showResult({ kind: "error"'));assert.ok(center.includes('requestGate.current.begin();\n    return true;'));assert.ok(provider.includes('const participationResult'));assert.ok(provider.includes('const participationFailure'));
});
