import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MagazineReadGate, MagazineReadError, magazineReadSnapshot, readMagazine } from '../lib/magazine-read.ts';
import { magazineErrorCopy } from '../lib/magazine-validation.ts';
const familyId='20000000-0000-4000-8000-000000000002',stamp='2026-10-11T09:00:00Z';
const article={id:'20000000-0000-4000-8000-000000000010',title:'QA story',summary:null,content:'Synthetic read fixture only, never persisted.',category:'story',tags:['QA'],visibility:'family',status:'published',featured:false,published_at:stamp,author_name:'QA Author',created_at:stamp,updated_at:stamp,reaction_count:0,comment_count:0,reacted_by_me:false,is_mine:false};
const snapshot=()=>({family:{id:familyId,name_bn:'পরীক্ষা পরিবার',name_en:'QA Family'},viewer:{displayName:'QA Owner',role:'owner'},articles:[structuredClone(article)],comments:[],media:[],permissions:{canManage:true},migrationRequired:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const observer=()=>{const state={data:'old-private-data',canManage:true,selected:'old-detail',loading:false,errors:[],setups:0,settles:0,loaded:0,draft:'unsaved article'};return{state,start:()=>{state.data=null;state.canManage=false;state.selected=null;state.loading=true;},loaded:data=>{state.data=data;state.canManage=data.permissions.canManage;state.loaded++;},setup:()=>state.setups++,failed:error=>state.errors.push(error.code),settled:()=>{state.loading=false;state.settles++;}};};
const run=(gate,ob,request,extra={})=>readMagazine({gate,...ob,request,...extra});

test('reload clears data/privileges immediately; failure requires explicit retry and retains local draft',async()=>{
 const gate=new MagazineReadGate(),ob=observer(),pending=deferred();let requests=0;
 const first=run(gate,ob,async init=>{requests++;assert.equal(init.cache,'no-store');assert.ok(init.signal);return pending.promise;});
 assert.equal(ob.state.data,null);assert.equal(ob.state.canManage,false);assert.equal(ob.state.selected,null);assert.equal(ob.state.loading,true);
 pending.reject(Error('network failure'));assert.equal(await first,false);assert.deepEqual(ob.state.errors,['MAGAZINE_LOAD_FAILED']);assert.equal(ob.state.loading,false);assert.equal(requests,1);assert.equal(ob.state.draft,'unsaved article');
 assert.equal(await run(gate,ob,async()=>{requests++;return Response.json(snapshot());}),true);assert.equal(requests,2);assert.equal(ob.state.loaded,1);assert.equal(ob.state.canManage,true);
});
test('late older success cannot overwrite newer failure; late older failure cannot clear newer success',async()=>{
 for(const olderFails of [false,true]){
  const gate=new MagazineReadGate(),ob=observer(),pending=deferred();let signal;
  const first=run(gate,ob,async init=>{signal=init.signal;return pending.promise;});
  const newer=olderFails?Response.json(snapshot()):Response.json({code:'MAGAZINE_BACKEND_UNAVAILABLE'},{status:502});
  assert.equal(await run(gate,ob,async()=>newer),olderFails);assert.equal(signal.aborted,true);assert.equal(await first,false);
  const before=structuredClone(ob.state);if(olderFails)pending.reject(Error('old failure'));else pending.resolve(Response.json(snapshot()));await Promise.resolve();assert.deepEqual(ob.state,before);
 }
});
test('generation guard also covers deferred JSON parsing and old finally callbacks',async()=>{
 const gate=new MagazineReadGate(),ob=observer(),parsed=deferred(),started=deferred();
 const first=run(gate,ob,async()=>({ok:true,status:200,json:()=>{started.resolve();return parsed.promise;}}));await started.promise;
 const value=snapshot();value.articles[0].title='Newer snapshot';await run(gate,ob,async()=>Response.json(value));assert.equal(await first,false);
 parsed.resolve(snapshot());await Promise.resolve();assert.equal(ob.state.data.articles[0].title,'Newer snapshot');assert.equal(ob.state.loaded,1);assert.equal(ob.state.settles,1);assert.equal(ob.state.loading,false);
});
test('unmount invalidation aborts and suppresses data, errors and settled updates even when request ignores abort',async()=>{
 const gate=new MagazineReadGate(),ob=observer(),pending=deferred();let signal;
 const result=run(gate,ob,async init=>{signal=init.signal;return pending.promise;});gate.invalidate();assert.equal(signal.aborted,true);assert.equal(await result,false);
 pending.resolve(Response.json(snapshot()));await Promise.resolve();assert.equal(ob.state.loaded,0);assert.equal(ob.state.errors.length,0);assert.equal(ob.state.settles,0);
});
test('deadline covers both hung fetch and hung JSON parsing, aborts request and permits explicit retry',async()=>{
 for(const hangJson of [false,true]){
  const gate=new MagazineReadGate(),ob=observer();let signal,requests=0;
  const result=await run(gate,ob,async init=>{requests++;signal=init.signal;return hangJson?{ok:true,status:200,json:()=>new Promise(()=>{})}:new Promise(()=>{});},{timeoutMs:5});
  assert.equal(result,false);assert.equal(signal.aborted,true);assert.deepEqual(ob.state.errors,['MAGAZINE_LOAD_TIMEOUT']);assert.equal(ob.state.loading,false);assert.equal(requests,1);
  assert.equal(await run(gate,ob,async()=>Response.json(snapshot())),true);
 }
});
test('malformed/partial/duplicate/orphan/coerced/date snapshots fail closed; family mismatch is distinct',()=>{
 assert.deepEqual(magazineReadSnapshot(snapshot(),familyId),snapshot());
 const empty=snapshot();empty.articles=[];empty.migrationRequired=true;assert.equal(magazineReadSnapshot(empty).migrationRequired,true);
 const variants=[null,[],{},...['family','viewer','permissions','migrationRequired','articles','comments','media'].map(key=>{const s=snapshot();delete s[key];return s;})];
 for(const patch of [s=>s.permissions.canManage='true',s=>s.permissions.canManage=false,s=>s.viewer.role='bad',s=>s.family.id='bad',s=>s.articles.push(structuredClone(article)),s=>s.articles[0].created_at='invalid',s=>s.articles[0].is_mine='false',s=>s.articles[0].reaction_count='0',s=>s.migrationRequired=true,s=>s.comments.push({id:'20000000-0000-4000-8000-000000000020',article_id:'20000000-0000-4000-8000-000000000099',author_name:'QA',body:'orphan',status:'visible',created_at:stamp,is_mine:false})]){const s=snapshot();patch(s);variants.push(s);}
 for(const value of variants)assert.throws(()=>magazineReadSnapshot(value),e=>e instanceof MagazineReadError&&e.code==='MAGAZINE_INVALID_SNAPSHOT');
 assert.throws(()=>magazineReadSnapshot(snapshot(),'10000000-0000-4000-8000-000000000001'),e=>e.code==='MAGAZINE_FAMILY_CHANGED');
});
test('setup/auth/row-limit/upstream/non-JSON responses never grant permissions or retry automatically',async()=>{
 for(const [response,code,setup]of [[Response.json({code:'FAMILY_SETUP_REQUIRED'},{status:409}),null,true],[new Response('sign in',{status:401}),'MAGAZINE_SIGN_IN_REQUIRED'],[new Response('denied',{status:403}),'MAGAZINE_ACCESS_DENIED'],[new Response('too many',{status:413}),'MAGAZINE_ROW_LIMIT'],[Response.json({code:'MAGAZINE_BACKEND_UNAVAILABLE'},{status:502}),'MAGAZINE_BACKEND_UNAVAILABLE'],[new Response('broken proxy',{status:502}),'MAGAZINE_BACKEND_UNAVAILABLE'],[new Response('not JSON',{status:200}),'MAGAZINE_INVALID_SNAPSHOT'],[Response.json({code:'FAMILY_SETUP_REQUIRED'}),'MAGAZINE_INVALID_SNAPSHOT']]){
  const gate=new MagazineReadGate(),ob=observer();let calls=0;assert.equal(await run(gate,ob,async()=>{calls++;return response;}),false);assert.equal(calls,1);assert.equal(ob.state.canManage,false);assert.equal(ob.state.data,null);assert.equal(ob.state.loading,false);assert.equal(ob.state.setups,setup?1:0);assert.deepEqual(ob.state.errors,code?[code]:[]);
 }
});
test('BN/EN error codes and client wiring keep Retry/form recovery guarded, dispose old effects and disable schema export',()=>{
 for(const locale of ['bn','en'])for(const code of ['MAGAZINE_INVALID_SNAPSHOT','MAGAZINE_FAMILY_CHANGED','MAGAZINE_SIGN_IN_REQUIRED','MAGAZINE_ACCESS_DENIED','MAGAZINE_LOAD_FAILED','MAGAZINE_LOAD_TIMEOUT','MAGAZINE_ROW_LIMIT'])assert.ok(magazineErrorCopy(code,locale));
 const source=readFileSync(new URL('../app/magazine-center.tsx',import.meta.url),'utf8');
 for(const text of ['readMagazine({ gate: readGate.current','expectedFamilyId: readFamily.current','lifecycle.abort(); gate.invalidate();','if (!lifecycle.signal.aborted)','setLoading(true); setFamily(undefined);','editorArticle.current = articleId; setEditingId(articleId)','disabled={exporting || migrationRequired}','if (loading || !family || migrationRequired || exporting) return;','if (!(await load())) return;','showResult({ kind: "error"'])assert.ok(source.includes(text),text);
 assert.ok(!source.includes('payload.articles ?? []'));assert.ok(!source.includes('Boolean(payload.permissions?.canManage)'));
});
