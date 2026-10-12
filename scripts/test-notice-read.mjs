import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readNotices, noticeEditorStillAvailable } from '../lib/notice-read.ts';
import { NoticeRequestGate, noticeReadSnapshot } from '../lib/notice-write-outcome.ts';
import { noticeErrorCopy } from '../lib/notice-validation.ts';
const family='20000000-0000-4000-8000-000000000002', other='10000000-0000-4000-8000-000000000001';
const row={id:'20000000-0000-4000-8000-000000000010',title_bn:'QA notice',title_en:null,body_bn:'Synthetic read-only fixture, never persisted.',body_en:null,category:'general',priority:'normal',status:'draft',is_pinned:false,publish_at:null,expires_at:null,created_at:'2026-10-12T10:00:00Z',updated_at:'2026-10-12T10:00:00Z'};
const snapshot=()=>({family:{id:family,name_bn:'পরীক্ষা পরিবার',name_en:null},notices:[structuredClone(row)],permissions:{canManage:true},migrationRequired:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const observer=()=>{const state={family:'old family',notices:['old data'],canManage:true,selected:'old detail',loading:false,errors:[],loaded:0,setups:0,settles:0,draft:'unsaved notice'};return{state,start:()=>{state.family=null;state.notices=[];state.canManage=false;state.selected=null;state.loading=true;},loaded:s=>{state.family=s.family;state.notices=s.notices;state.canManage=s.permissions.canManage;state.loaded++;},setup:()=>state.setups++,failed:e=>state.errors.push(e.code),settled:()=>{state.loading=false;state.settles++;}};};
const run=(gate,ob,request,extra={})=>readNotices({gate,...ob,request,...extra});
test('reads clear previous data/detail/privileges immediately, retain unsaved form and retry only explicitly',async()=>{
 const gate=new NoticeRequestGate(),ob=observer(),pending=deferred();let requests=0;
 const first=run(gate,ob,async init=>{requests++;assert.equal(init.cache,'no-store');assert.ok(init.signal);return pending.promise;});
 assert.equal(ob.state.family,null);assert.deepEqual(ob.state.notices,[]);assert.equal(ob.state.canManage,false);assert.equal(ob.state.selected,null);assert.equal(ob.state.loading,true);
 pending.reject(Error('offline'));assert.equal(await first,false);assert.deepEqual(ob.state.errors,['NOTICE_LOAD_FAILED']);assert.equal(ob.state.loading,false);assert.equal(requests,1);assert.equal(ob.state.draft,'unsaved notice');
 assert.equal(await run(gate,ob,async()=>{requests++;return Response.json(snapshot());}),true);assert.equal(requests,2);assert.equal(ob.state.loaded,1);
});
test('older success/error/finally cannot overwrite newer success or failure even when fetch ignores abort',async()=>{
 for(const olderFails of [true,false]){const gate=new NoticeRequestGate(),ob=observer(),pending=deferred();let signal;
 const first=run(gate,ob,async init=>{signal=init.signal;return pending.promise;});
 assert.equal(await run(gate,ob,async()=>olderFails?Response.json(snapshot()):new Response('upstream',{status:502})),olderFails);assert.equal(signal.aborted,true);assert.equal(await first,false);
 const expected=structuredClone(ob.state);if(olderFails)pending.reject(Error('late failure'));else pending.resolve(Response.json(snapshot()));await Promise.resolve();assert.deepEqual(ob.state,expected);assert.equal(ob.state.settles,1);}
});
test('obsolete JSON parsing cannot publish old notices or settle a newer load',async()=>{
 const gate=new NoticeRequestGate(),ob=observer(),parsed=deferred(),started=deferred();
 const first=run(gate,ob,async()=>({ok:true,status:200,json:()=>{started.resolve();return parsed.promise;}}));await started.promise;
 const newer=snapshot();newer.notices[0].title_bn='Newer notice';await run(gate,ob,async()=>Response.json(newer));assert.equal(await first,false);
 parsed.resolve(snapshot());await Promise.resolve();assert.equal(ob.state.notices[0].title_bn,'Newer notice');assert.equal(ob.state.loaded,1);assert.equal(ob.state.settles,1);
});
test('unmount cancels fetch and suppresses loaded/error/finally updates, without waiting for ignored abort',async()=>{
 const gate=new NoticeRequestGate(),ob=observer(),pending=deferred();let signal;
 const first=run(gate,ob,async init=>{signal=init.signal;return pending.promise;});gate.cancel();assert.equal(signal.aborted,true);assert.equal(await first,false);
 pending.resolve(Response.json(snapshot()));await Promise.resolve();assert.equal(ob.state.loaded,0);assert.deepEqual(ob.state.errors,[]);assert.equal(ob.state.settles,0);
});
test('deadline settles hung fetch and JSON even when abort is ignored; late completion cannot show success',async()=>{
 for(const jsonHangs of [false,true]){const gate=new NoticeRequestGate(),ob=observer(),late=deferred();let requests=0,signal;
 assert.equal(await run(gate,ob,async init=>{requests++;signal=init.signal;return jsonHangs?{ok:true,status:200,json:()=>late.promise}:late.promise;},{timeoutMs:5}),false);
 assert.equal(signal.aborted,true);assert.equal(requests,1);assert.equal(ob.state.loading,false);assert.deepEqual(ob.state.errors,['NOTICE_LOAD_TIMEOUT']);assert.equal(ob.state.loaded,0);assert.equal(ob.state.settles,1);
 const before=structuredClone(ob.state);late.resolve(jsonHangs?snapshot():Response.json(snapshot()));await Promise.resolve();assert.deepEqual(ob.state,before);
 assert.equal(await run(gate,ob,async()=>Response.json(snapshot())),true);assert.equal(ob.state.loaded,1);}
});
test('malformed/coerced/duplicate/oversize/migration-with-rows snapshots fail closed, family mismatch is distinct',async()=>{
 const variants=[null,[],{},...['family','permissions','migrationRequired','notices'].map(key=>{const p=snapshot();delete p[key];return p;})];
 for(const patch of [p=>p.family.id='bad',p=>p.permissions.canManage='true',p=>p.notices[0].is_pinned='false',p=>p.notices[0].updated_at='bad',p=>p.notices[0].priority=['normal'],p=>p.notices.push({...row}),p=>p.notices=Array(20001).fill(row),p=>p.migrationRequired=true]){const p=snapshot();patch(p);variants.push(p);}
 for(const value of variants){const ob=observer();assert.equal(await run(new NoticeRequestGate(),ob,async()=>Response.json(value)),false);assert.deepEqual(ob.state.errors,['NOTICE_INVALID_SNAPSHOT']);assert.equal(ob.state.canManage,false);assert.deepEqual(ob.state.notices,[]);}
 const ob=observer();assert.equal(await run(new NoticeRequestGate(),ob,async()=>Response.json(snapshot()),{expectedFamilyId:other}),false);assert.deepEqual(ob.state.errors,['NOTICE_FAMILY_CHANGED']);
 assert.equal(await run(new NoticeRequestGate(),observer(),async()=>Response.json(snapshot()),{expectedFamilyId:family.toUpperCase()}),true);
});
test('setup/auth/row limit/server/plain text responses use safe codes without automatic retries',async()=>{
 const cases=[[Response.json({code:'FAMILY_SETUP_REQUIRED'},{status:409}),null,true],[new Response('sign in',{status:401}),'NOTICE_SIGN_IN_REQUIRED'],[new Response('denied',{status:403}),'NOTICE_ACCESS_DENIED'],[new Response('too many',{status:413}),'NOTICES_ROW_LIMIT'],[new Response('proxy',{status:502}),'NOTICE_BACKEND_UNAVAILABLE'],[Response.json(null,{status:500}),'NOTICE_BACKEND_UNAVAILABLE'],[Response.json({code:'untrusted arbitrary message'},{status:502}),'NOTICE_BACKEND_UNAVAILABLE'],[Response.json({code:'NOTICE_INVALID_SNAPSHOT'},{status:503}),'NOTICE_INVALID_SNAPSHOT'],[new Response('not JSON',{status:200}),'NOTICE_INVALID_SNAPSHOT'],[Response.json({code:'FAMILY_SETUP_REQUIRED'}),'NOTICE_INVALID_SNAPSHOT']];
 for(const [response,code,setup]of cases){const ob=observer();let requests=0;assert.equal(await run(new NoticeRequestGate(),ob,async()=>{requests++;return response;}),false);assert.equal(requests,1);assert.equal(ob.state.canManage,false);assert.equal(ob.state.loading,false);assert.deepEqual(ob.state.errors,code?[code]:[]);assert.equal(ob.state.setups,setup?1:0);}
});
test('unknown-write verification remains locked after failed/stale/migration reload and only valid explicit read unlocks',async()=>{
 const gate=new NoticeRequestGate(),ob=observer();let blocked=true;
 const verify=async request=>{if(await run(gate,ob,request))blocked=false;};
 await verify(async()=>{throw Error('offline');});assert.equal(blocked,true);
 const migration=snapshot();migration.notices=[];migration.migrationRequired=true;await verify(async()=>Response.json(migration));assert.equal(blocked,true);assert.equal(ob.state.canManage,true);
 const old=deferred();const first=verify(async()=>old.promise);await run(gate,ob,async()=>Response.json(snapshot()));await first;assert.equal(blocked,true);old.resolve(Response.json(snapshot()));await Promise.resolve();assert.equal(blocked,true);
 await verify(async()=>Response.json({...snapshot(),notices:[]}));assert.equal(blocked,false);
});
test('valid reload preserves available draft editors but rejects disappeared/changed/unmanageable records; export checkpoint expires',()=>{
 const p=noticeReadSnapshot(snapshot());assert.equal(noticeEditorStillAvailable(p,null),true);assert.equal(noticeEditorStillAvailable(p,row),true);
 for(const value of [{...p,notices:[]},{...p,notices:[{...row,updated_at:'2026-10-12T11:00:00Z'}]},{...p,permissions:{canManage:false}},{...p,migrationRequired:true}])assert.equal(noticeEditorStillAvailable(value,row),false);
 const gate=new NoticeRequestGate(),checkpoint=gate.checkpoint();assert.equal(gate.current(checkpoint),true);gate.begin();assert.equal(gate.current(checkpoint),false);
});
test('BN/EN error, hidden stale UI, explicit retry, editor and export guards are wired into the component',()=>{
 for(const locale of ['bn','en'])for(const code of ['NOTICE_LOAD_FAILED','NOTICE_LOAD_TIMEOUT','NOTICE_SIGN_IN_REQUIRED','NOTICE_ACCESS_DENIED','NOTICE_BACKEND_UNAVAILABLE','NOTICE_FAMILY_CHANGED','NOTICES_ROW_LIMIT','NOTICE_EXPORT_SUPERSEDED'])assert.ok(noticeErrorCopy(code,locale));
 const source=readFileSync(new URL('../app/notice-center.tsx',import.meta.url),'utf8');
 for(const text of ['readNotices({ gate: requestGate.current','expectedFamilyId: readFamily.current','setLoading(true); setFamily(undefined); setNotices([]); setCanManage(false); setSelected(null);','if (loading) return','if (await loadNotices())','noticeEditorStillAvailable(snapshot, editorNotice.current)','currentRequestGate.cancel();','showResult({ kind: "error"','requestGate.current.current(checkpoint)','verificationBlocked ? verifyNoticeOutcome() : loadNotices()'])assert.ok(source.includes(text),text);
 assert.ok(source.indexOf('if (loading) return')<source.indexOf('<NoticeTicker notices={notices} />'));
});
