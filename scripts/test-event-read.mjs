import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {readEvents,eventSafeSnapshot,eventEditorStillAvailable} from '../lib/event-read.ts';
import {NoticeRequestGate} from '../lib/notice-write-outcome.ts';
import {eventErrorCopy} from '../lib/event-validation.ts';
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000010',stamp='2026-10-12T10:00:00Z';
const row={id,title_bn:'QA event',title_en:null,description_bn:'Synthetic in-memory read fixture, never persisted.',description_en:null,event_type:'meeting',start_at:stamp,end_at:null,venue:'QA Location',city:null,meeting_point:null,estimated_cost_per_person:'1.25',total_budget:'10.50',capacity:12,registration_deadline:null,status:'published',created_at:stamp,updated_at:stamp};
const rsvp={id:'20000000-0000-4000-8000-000000000011',event_id:id,is_current_user:true,respondent_name:'QA owner',response:'going',guest_count:2,note:null,updated_at:stamp};
const comment={id:'20000000-0000-4000-8000-000000000012',event_id:id,author_name:'QA owner',body:'QA comment',created_at:stamp};
const media={id:'20000000-0000-4000-8000-000000000013',event_id:id,file_name:'QA.png',mime_type:'image/png',file_size:68,caption:null,uploader_name:'QA owner',created_at:stamp};
const snapshot=()=>({family:{id:family,name_bn:'পরীক্ষা পরিবার',name_en:null},events:[structuredClone(row)],rsvps:[structuredClone(rsvp)],comments:[structuredClone(comment)],media:[structuredClone(media)],permissions:{canManage:true},migrationRequired:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const observer=()=>{const state={family:'old family',events:['old event'],rsvps:['old RSVP'],comments:['old comment'],media:['old file'],canManage:true,selected:'old detail',loading:false,error:null,errors:[],loaded:0,setups:0,settles:0,draft:'unsaved form'};
 return{state,start:()=>{Object.assign(state,{family:null,events:[],rsvps:[],comments:[],media:[],canManage:false,selected:null,loading:true,error:null});},loaded:s=>{Object.assign(state,{family:s.family,events:s.events,rsvps:s.rsvps,comments:s.comments,media:s.media,canManage:s.permissions.canManage&&!s.migrationRequired});state.loaded++;},setup:()=>state.setups++,failed:e=>{state.error=e.code;state.errors.push(e.code);},settled:()=>{state.loading=false;state.settles++;}};};
const run=(gate,ob,request,extra={})=>readEvents({gate,...ob,request,...extra});
test('read starts by clearing all old views/permissions, retains unsaved form, and retries only explicitly',async()=>{
 const gate=new NoticeRequestGate(),ob=observer(),pending=deferred();let calls=0;
 const first=run(gate,ob,async init=>{calls++;assert.equal(init.cache,'no-store');assert.ok(init.signal);return pending.promise;});
 for(const key of ['events','rsvps','comments','media'])assert.deepEqual(ob.state[key],[]);assert.equal(ob.state.family,null);assert.equal(ob.state.selected,null);assert.equal(ob.state.canManage,false);assert.equal(ob.state.loading,true);
 pending.reject(Error('offline'));assert.equal(await first,false);assert.equal(calls,1);assert.equal(ob.state.loading,false);assert.equal(ob.state.error,'EVENT_LOAD_FAILED');assert.equal(ob.state.draft,'unsaved form');
 assert.equal(await run(gate,ob,async()=>{calls++;return Response.json(snapshot());}),true);assert.equal(calls,2);assert.equal(ob.state.loaded,1);assert.equal(ob.state.error,null);
});
test('old success/error/finally cannot overwrite either newer success or failure despite ignored abort',async()=>{
 for(const olderFails of [true,false])for(const newerFails of [true,false]){const gate=new NoticeRequestGate(),ob=observer(),pending=deferred();let signal;
 const first=run(gate,ob,async init=>{signal=init.signal;return pending.promise;});assert.equal(await run(gate,ob,async()=>newerFails?new Response('upstream',{status:502}):Response.json(snapshot())),!newerFails);
 assert.equal(signal.aborted,true);assert.equal(await first,false);const before=structuredClone(ob.state);if(olderFails)pending.reject(Error('late'));else pending.resolve(Response.json(snapshot()));await Promise.resolve();assert.deepEqual(ob.state,before);assert.equal(ob.state.settles,1);}
});
test('deferred obsolete JSON cannot publish stale child data or settle a newer request',async()=>{
 const gate=new NoticeRequestGate(),ob=observer(),parsed=deferred(),started=deferred();
 const first=run(gate,ob,async()=>({ok:true,status:200,json:()=>{started.resolve();return parsed.promise;}}));await started.promise;
 const newer=snapshot();newer.comments[0].body='Newer comment';await run(gate,ob,async()=>Response.json(newer));assert.equal(await first,false);
 parsed.resolve(snapshot());await Promise.resolve();assert.equal(ob.state.comments[0].body,'Newer comment');assert.equal(ob.state.loaded,1);assert.equal(ob.state.settles,1);
});
test('unmount invalidates fetch/JSON and suppresses callbacks without waiting for ignored abort',async()=>{
 for(const jsonHangs of [true,false]){const gate=new NoticeRequestGate(),ob=observer(),late=deferred(),started=deferred();let signal;
 const first=run(gate,ob,async init=>{signal=init.signal;if(!jsonHangs){started.resolve();return late.promise;}return{status:200,ok:true,json:()=>{started.resolve();return late.promise;}};});await started.promise;
 gate.cancel();assert.equal(signal.aborted,true);assert.equal(await first,false);late.resolve(jsonHangs?snapshot():Response.json(snapshot()));await Promise.resolve();assert.equal(ob.state.loaded,0);assert.deepEqual(ob.state.errors,[]);assert.equal(ob.state.settles,0);}
});
test('one fetch-and-JSON deadline settles hangs; late completion is ignored and explicit recovery works',async()=>{
 for(const jsonHangs of [true,false]){const gate=new NoticeRequestGate(),ob=observer(),late=deferred();let calls=0,signal;
 assert.equal(await run(gate,ob,async init=>{calls++;signal=init.signal;return jsonHangs?{ok:true,status:200,json:()=>late.promise}:late.promise;},{timeoutMs:5}),false);
 assert.equal(signal.aborted,true);assert.equal(calls,1);assert.equal(ob.state.loading,false);assert.deepEqual(ob.state.errors,['EVENT_LOAD_TIMEOUT']);assert.equal(ob.state.loaded,0);assert.equal(ob.state.settles,1);
 const before=structuredClone(ob.state);late.resolve(jsonHangs?snapshot():Response.json(snapshot()));await Promise.resolve();assert.deepEqual(ob.state,before);assert.equal(await run(gate,ob,async()=>Response.json(snapshot())),true);}
});
test('complete strict snapshots reject malformed/coerced/duplicate/orphan/oversize/migration rows and child scope',async()=>{
 const variants=[null,[],{},...['family','permissions','migrationRequired','events','rsvps','comments','media'].map(k=>{const p=snapshot();delete p[k];return p;})];
 for(const patch of [p=>p.permissions.canManage='true',p=>p.events[0].updated_at='bad',p=>p.events.push({...row}),p=>p.events=Array(20001).fill(row),p=>p.rsvps[0].event_id=other,p=>p.rsvps[0].guest_count=11,p=>p.rsvps[0].note='x'.repeat(501),p=>p.rsvps[0].is_current_user='true',p=>p.rsvps.push({...rsvp,id:other}),p=>p.comments[0].body='x',p=>p.comments[0].body='x'.repeat(2001),p=>p.comments[0].family_id=other,p=>p.media[0].file_name='../QA.png',p=>p.media[0].file_size=8*1024*1024+1,p=>p.media[0].caption='x'.repeat(501),p=>p.media[0].family_id=other,p=>p.migrationRequired=true]){const p=snapshot();patch(p);variants.push(p);}
 for(const p of variants){const ob=observer();assert.equal(await run(new NoticeRequestGate(),ob,async()=>Response.json(p)),false);assert.deepEqual(ob.state.errors,['EVENT_INVALID_SNAPSHOT']);assert.equal(ob.state.canManage,false);assert.deepEqual(ob.state.events,[]);}
});
test('safe projection excludes raw account/storage/family fields; member snapshot cannot include drafts',()=>{
 const p=snapshot();p.events[0].created_by_user_id='private';p.rsvps[0].auth_user_id='private';p.comments[0].auth_user_id='private';p.media[0].storage_key='private';p.media[0].uploaded_by_user_id='private';p.media[0].family_id=family;
 const safe=eventSafeSnapshot(p);assert.ok(safe);for(const value of [...safe.events,...safe.rsvps,...safe.comments,...safe.media])for(const key of ['created_by_user_id','auth_user_id','storage_key','uploaded_by_user_id','family_id'])assert.equal(Object.hasOwn(value,key),false);
 p.permissions.canManage=false;assert.ok(eventSafeSnapshot(p));p.events[0].status='draft';assert.equal(eventSafeSnapshot(p),null);
});
test('expected-family change fails closed with a distinct error and accepts case-normalized matching UUID',async()=>{
 const ob=observer();assert.equal(await run(new NoticeRequestGate(),ob,async()=>Response.json(snapshot()),{expectedFamilyId:other}),false);assert.deepEqual(ob.state.errors,['EVENT_FAMILY_CHANGED']);assert.equal(ob.state.loaded,0);assert.equal(ob.state.family,null);
 assert.equal(await run(new NoticeRequestGate(),observer(),async()=>Response.json(snapshot()),{expectedFamilyId:family.toUpperCase()}),true);
});
test('setup/auth/row-limit/upstream/non-JSON responses use safe codes without reflecting arbitrary messages',async()=>{
 for(const [response,code,setup]of [[Response.json({code:'FAMILY_SETUP_REQUIRED'},{status:409}),null,true],[new Response('sign in',{status:401}),'EVENT_SIGN_IN_REQUIRED'],[new Response('denied',{status:403}),'EVENT_ACCESS_DENIED'],[new Response('large',{status:413}),'EVENTS_ROW_LIMIT'],[new Response('proxy secrets',{status:502}),'EVENT_BACKEND_UNAVAILABLE'],[Response.json({error:'private internal text'},{status:500}),'EVENT_BACKEND_UNAVAILABLE'],[Response.json({code:'EVENT_INVALID_SNAPSHOT'},{status:503}),'EVENT_INVALID_SNAPSHOT'],[new Response('broken JSON',{status:200}),'EVENT_INVALID_SNAPSHOT'],[Response.json({code:'FAMILY_SETUP_REQUIRED'}),'EVENT_INVALID_SNAPSHOT']]){
 const ob=observer();let calls=0;assert.equal(await run(new NoticeRequestGate(),ob,async()=>{calls++;return response;}),false);assert.equal(calls,1);assert.equal(ob.state.canManage,false);assert.equal(ob.state.loading,false);assert.deepEqual(ob.state.errors,code?[code]:[]);assert.equal(ob.state.setups,setup?1:0);}
});
test('unknown-write lock survives failed/stale/setup/migration reads and only valid explicit reload unlocks',async()=>{
 const gate=new NoticeRequestGate(),ob=observer();let blocked=true;const verify=async request=>{if(await run(gate,ob,request))blocked=false;};
 await verify(async()=>{throw Error('offline');});assert.equal(blocked,true);await verify(async()=>Response.json({code:'FAMILY_SETUP_REQUIRED'},{status:409}));assert.equal(blocked,true);
 const migration=snapshot();for(const k of ['events','rsvps','comments','media'])migration[k]=[];migration.migrationRequired=true;await verify(async()=>Response.json(migration));assert.equal(blocked,true);assert.equal(ob.state.canManage,false);
 const late=deferred(),first=verify(async()=>late.promise);await run(gate,ob,async()=>Response.json(snapshot()));await first;assert.equal(blocked,true);late.resolve(Response.json(snapshot()));await Promise.resolve();assert.equal(blocked,true);
 await verify(async()=>Response.json(snapshot()));assert.equal(blocked,false);
});
test('editor version/status/permission eligibility and export checkpoints reject stale data without discarding valid drafts',()=>{
 const p=eventSafeSnapshot(snapshot());assert.equal(eventEditorStillAvailable(p,null),true);assert.equal(eventEditorStillAvailable(p,row),true);
 for(const value of [{...p,events:[]},{...p,events:[{...row,updated_at:'2026-10-12T11:00:00Z'}]},{...p,events:[{...row,status:'completed'}]},{...p,permissions:{canManage:false}},{...p,migrationRequired:true}])assert.equal(eventEditorStillAvailable(value,row),false);
 assert.equal(eventEditorStillAvailable({...p,permissions:{canManage:false}},null),false);const gate=new NoticeRequestGate(),checkpoint=gate.checkpoint();assert.equal(gate.current(checkpoint),true);gate.begin();assert.equal(gate.current(checkpoint),false);const next=gate.checkpoint();gate.cancel();assert.equal(gate.current(next),false);
});
test('localized explicit Error/Retry/loading/editor/export wiring parses and hides stale portals before rendering',()=>{
 for(const locale of ['bn','en'])for(const code of ['EVENT_LOAD_FAILED','EVENT_SCHEMA_UNAVAILABLE','EVENT_LOAD_TIMEOUT','EVENT_SIGN_IN_REQUIRED','EVENT_ACCESS_DENIED','EVENT_BACKEND_UNAVAILABLE','EVENT_FAMILY_CHANGED','EVENTS_ROW_LIMIT','EVENT_EXPORT_SUPERSEDED'])assert.ok(eventErrorCopy(code,locale));
 const source=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8');assert.equal(ts.createSourceFile('event.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);
 for(const text of ['readEvents({ gate: requestGate.current, expectedFamilyId: readFamily.current','setLoading(true); setLoadError(null); setFamily(undefined); setEvents([]); setRsvps([]); setComments([]); setMedia([]); setCanManage(false); setSelectedId(null);','if (loading) return','if (await loadEvents())','eventEditorStillAvailable(snapshot, editorEvent.current)','editorEvent.current = event; setEditingEvent(event);','gate.cancel();','showResult({ kind: "error"','requestGate.current.current(checkpoint)','EVENT_EXPORT_SUPERSEDED','verificationBlocked ? verifyEventOutcome() : loadEvents()','eventErrorCopy(loadError ?? "EVENT_INVALID_SNAPSHOT", locale)'])assert.ok(source.includes(text),text);
 assert.ok(source.indexOf('if (loading) return')<source.indexOf('<Dialog open={createOpen}'));assert.ok(source.indexOf('if (loading) return')<source.indexOf('<section className="grid gap-4'));assert.ok(!source.includes('const timer = setTimeout(() => ticket.controller.abort()'));
 assert.ok(source.indexOf('if (migrationRequired) return')<source.indexOf('<Dialog open={createOpen}'));assert.ok(source.includes('eventErrorCopy("EVENT_SCHEMA_UNAVAILABLE", locale)'));
});
