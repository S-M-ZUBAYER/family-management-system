import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import ts from 'typescript';
import {healthReadSnapshot,HealthReadGate,HealthReadError,readHealth,healthReadCopy} from '../lib/health-read.ts';
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000090',stamp='2026-10-13T08:00:00.000Z',actor='qa-owner';
const base={family:{id:family,name_bn:'QA পরিবার',name_en:'QA Family'},scope:{familyId:family,actorId:actor},viewer:{displayName:'QA Owner',role:'owner'},profile:null,medications:[],appointments:[],measurements:[],documents:[],emergencyDirectory:[],sosAlerts:[],sosResponses:[],permissions:{canManageSos:true},migrationRequired:false};
const shared={member_name:'QA Owner',blood_group:'O+',conditions:null,allergies:null,emergency_notes:null,emergency_contact_name:null,emergency_contact_phone:null,donor_available:false,last_donation_date:null,visibility:'private'};
const profile={...shared,id,date_of_birth:null,height_cm:'170.00',weight_kg:65,doctor_name:null,doctor_phone:null,updated_at:stamp};
const medicine={id,medicine_name:'QA medicine',dosage:'Recorded label',frequency:'Recorded schedule',reminder_times:['08:00'],start_date:'2026-10-13',end_date:null,instructions:null,prescribing_doctor:null,status:'active',created_at:stamp,updated_at:stamp};
const appointment={id,title:'QA appointment',doctor_name:null,facility:null,scheduled_at:stamp,reminder_minutes:60,status:'scheduled',notes:null,created_at:stamp,updated_at:stamp};
const measurement={id,measurement_type:'weight',value_primary:'65.00',value_secondary:null,unit:'kg',measured_at:stamp,notes:null,created_at:stamp};
const document={id,file_name:'qa.png',mime_type:'image/png',file_size:68,category:'other',title:'QA only',document_date:null,notes:null,created_at:stamp};
const alert={id,reporter_name:'QA Owner',alert_type:'other',message:'Synthetic helper only; never sent',preferred_contact:null,latitude:null,longitude:null,location_accuracy_m:null,location_label:null,status:'active',acknowledged_by_name:null,acknowledged_at:null,resolved_at:null,resolution_note:null,created_at:stamp,updated_at:stamp,is_reporter:true};
const response={id,alert_id:id,responder_name:'QA helper',response_type:'update',note:null,created_at:stamp,is_mine:false};
const full={...base,profile,medications:[medicine],appointments:[appointment],measurements:[measurement],documents:[document],emergencyDirectory:[{...shared,donor_available:true}],sosAlerts:[alert],sosResponses:[response]};
const reply=(data,status=200)=>Response.json(data,{status});const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('complete empty/populated snapshots validate owner scope, permissions and nullable numeric/date fields',()=>{
 assert.ok(healthReadSnapshot(base));assert.ok(healthReadSnapshot(full));assert.ok(healthReadSnapshot({...base,family:{...base.family,name_en:''}}));assert.ok(healthReadSnapshot({...base,migrationRequired:true}));assert.ok(healthReadSnapshot({...base,viewer:{...base.viewer,role:'member'},permissions:{canManageSos:false}}));
 for(const patch of [{scope:null},{scope:{...base.scope,familyId:id}},{scope:{...base.scope,actorId:''}},{viewer:{...base.viewer,role:'admin'}},{permissions:{canManageSos:false}},{profile:{}},{profile:{...profile,auth_user_id:'other'}},{medications:undefined},{documents:[] ,migrationRequired:true,profile},{migrationRequired:'false'}])assert.equal(healthReadSnapshot({...base,...patch}),null);
});
test('all section data rejects duplicate/invalid IDs, versions, malformed arrays, unknown statuses and orphan responses',()=>{
 for(const patch of [{medications:[medicine,medicine]},{medications:[{...medicine,reminder_times:['08:00','08:00']}]},{medications:[{...medicine,end_date:'2026-10-12'}]},{appointments:[{...appointment,reminder_minutes:-1}]},{measurements:[{...measurement,value_primary:'NaN'}]},{documents:[{...document,file_size:'68'}]},{sosAlerts:[{...alert,reporter_user_id:'other'}]},{sosAlerts:[{...alert,is_reporter:'true'}]},{sosAlerts:[{...alert,latitude:1,longitude:null}]},{sosAlerts:[{...alert,latitude:100,longitude:1}]},{sosResponses:[{...response,alert_id:family}]},{sosResponses:[{...response,created_at:'bad'}]}])assert.equal(healthReadSnapshot({...full,...patch}),null);
});
test('private donors and emergency directory medical redaction are validated; public family sharing remains allowed',()=>{
 assert.ok(healthReadSnapshot(full));assert.equal(healthReadSnapshot({...base,emergencyDirectory:[shared]}),null);
 for(const key of ['conditions','allergies','emergency_notes','emergency_contact_name','emergency_contact_phone'])assert.equal(healthReadSnapshot({...base,emergencyDirectory:[{...shared,donor_available:true,[key]:'must be hidden'}]}),null);
 assert.equal(healthReadSnapshot({...base,emergencyDirectory:[{...shared,visibility:'emergency',conditions:'must be hidden'}]}),null);assert.ok(healthReadSnapshot({...base,emergencyDirectory:[{...shared,visibility:'emergency',allergies:'consented'}]}));assert.ok(healthReadSnapshot({...base,emergencyDirectory:[{...shared,visibility:'family',conditions:'consented'}]}));
});
test('20,000 rows per section are supported; over-cap data is never silently clipped',()=>{
 const rows=Array.from({length:20000},(_,i)=>({...measurement,id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0')}));assert.ok(healthReadSnapshot({...base,measurements:rows}));assert.equal(healthReadSnapshot({...base,measurements:[...rows,measurement]}),null);
});
test('read returns coded auth/setup/context/limit/invalid/backend failures without retry',async()=>{
 assert.deepEqual(await readHealth(async()=>reply(full)),full);
 for(const [status,data,code]of [[401,{},'HEALTH_READ_SIGN_IN'],[403,{},'HEALTH_READ_ACCESS'],[413,{},'HEALTH_ROW_LIMIT'],[409,{code:'FAMILY_SETUP_REQUIRED'},'HEALTH_READ_SETUP'],[409,{code:'HEALTH_READ_CONTEXT'},'HEALTH_READ_CONTEXT'],[502,{},'HEALTH_READ_FAILED'],[200,null,'HEALTH_READ_INVALID']]){let calls=0;await assert.rejects(readHealth(async()=>{calls++;return reply(data,status);}),e=>e.code===code);assert.equal(calls,1);}
 await assert.rejects(readHealth(async()=>{throw Error('offline');}),HealthReadError);await assert.rejects(readHealth(async()=>new Response('not JSON')),HealthReadError);
});
test('deadline covers fetch and deferred JSON even when AbortSignal is ignored',async()=>{
 for(const request of [async()=>new Promise(()=>{}),async()=>({status:200,ok:true,json:()=>new Promise(()=>{})})])await assert.rejects(readHealth(request,undefined,10),e=>e.code==='HEALTH_READ_TIMEOUT');
});
test('new reads/unmount invalidate old requests and suppress late medical data/errors/finally effects',async()=>{
 const gate=new HealthReadGate(),old=gate.begin(),json=deferred(),commits=[];
 const pending=readHealth(async()=>({status:200,ok:true,json:()=>json.promise}),old.controller.signal).then(p=>{if(gate.current(old))commits.push(p);}).catch(()=>{});await Promise.resolve();const current=gate.begin();assert.equal(old.controller.signal.aborted,true);const p=await readHealth(async()=>reply(base),current.controller.signal);if(gate.current(current))commits.push(p);json.resolve(full);await pending;assert.deepEqual(commits,[base]);gate.invalidate();assert.equal(gate.current(current),false);
});
test('scope switch and stale export checks reject cached-owner context; stable gates do not require language reload',()=>{
 const valid=healthReadSnapshot(full);assert.equal(valid.scope.actorId,actor);const changed=healthReadSnapshot({...full,scope:{...base.scope,actorId:'other-account'}});assert.ok(changed);assert.notEqual(changed.scope.actorId,valid.scope.actorId);
 for(const locale of ['bn','en'])for(const code of ['HEALTH_READ_TIMEOUT','HEALTH_READ_INVALID','HEALTH_READ_CONTEXT','HEALTH_READ_ACCESS','HEALTH_ROW_LIMIT'])assert.ok(healthReadCopy(code,locale));
});
test('API and UI wire private scope/complete validation/Retry, busy guards, fresh export and five disabled portals',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),ui=read('app/health-center.tsx'),api=read('app/api/health/route.ts');
 assert.match(api,/scope:\{familyId:membership.family_id,actorId:user.userId\}/);assert.match(api,/currentMembership.role!==membership.role/);assert.match(api,/healthReadSnapshot\(snapshot\)/);assert.match(api,/"Cache-Control":"no-store"/);assert.match(ui,/healthReads.current.begin/);assert.match(ui,/snapshotRef.current=null/);assert.match(ui,/healthWork.current.ready=false/);assert.match(ui,/readHealth\(init=>fetch/);assert.match(ui,/snapshot.scope.actorId!==captured.scope.actorId/);assert.match(ui,/if\(!current\(\)\)throw new HealthReadError/);assert.match(ui,/acceptedScope.current.actorId!==p.scope.actorId/);assert.match(ui,/readLocale.current/);assert.match(ui,/registrationSequence/);assert.match(ui,/reminderSequence/);assert.match(ui,/editorOpen.current\|\|readPending.current/);assert.equal((ui.match(/if\(!beginHealthAction\(\)\)return;/g)||[]).length,9);assert.equal((ui.match(/<fieldset disabled=\{saving \|\| exporting \|\| migrationRequired \|\| loading \|\| loadError\}/g)||[]).length,5);assert.match(ui,/Retry/);
 assert.equal(ts.createSourceFile('health-center.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);
 assert.match(ui,/request===locationRequest.current/);assert.match(ui,/sequence===loadSequence.current/);assert.match(ui,/snapshotRef.current\?\.scope.actorId===scope\?\.actorId/);
});
