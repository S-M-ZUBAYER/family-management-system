import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as healthWrites from '../lib/health-record-write.ts';
import * as healthValidation from '../lib/health-validation.ts';
import * as healthSosWrites from '../lib/health-sos-write.ts';
import {HealthRecordWriteError,healthRecordWrite,healthRecordWriteResponse,healthPublicRecord,healthWriteContext,healthRecordFilter,healthRecordAcknowledged,readHealthRecordMutation,healthRecordFeedback,healthOrdinaryKind} from '../lib/health-record-write.ts';
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000090',actor='qa-owner',stamp='2026-10-14T08:00:00.123456+00:00',scope={familyId:family,actorId:actor};
const owner={family_id:family,auth_user_id:actor};
const rows={
 profile:{...owner,id,member_name:'QA Owner',blood_group:'O+',date_of_birth:null,height_cm:'170.00',weight_kg:65,conditions:null,allergies:null,emergency_notes:null,doctor_name:null,doctor_phone:null,emergency_contact_name:null,emergency_contact_phone:null,donor_available:false,last_donation_date:null,visibility:'private',updated_at:stamp},
 medication:{...owner,id,medicine_name:'QA medicine',dosage:'Recorded label',frequency:'Recorded schedule',reminder_times:['08:00'],start_date:'2026-10-14',end_date:null,instructions:null,prescribing_doctor:null,status:'active',created_at:stamp,updated_at:stamp},
 appointment:{...owner,id,title:'QA appointment',doctor_name:null,facility:null,scheduled_at:stamp,reminder_minutes:60,status:'scheduled',notes:null,created_at:stamp,updated_at:stamp},
 measurement:{...owner,id,measurement_type:'weight',value_primary:'65.00',value_secondary:null,unit:'kg',measured_at:stamp,notes:'QA "quoted", slash\\ and বাংলা',created_at:stamp},
};
const opts=(kind='medication',extra={})=>({kind,familyId:family,actorId:actor,expected:healthPublicRecord(kind,rows[kind]),existing:rows[kind],changes:{},write:async changes=>[{...rows[kind],...changes}],audit:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
test('strict own expected scope/record and prototype actions; public projection never exposes owner metadata',()=>{
 for(const kind of Object.keys(rows)){const row=healthPublicRecord(kind,rows[kind]);assert.ok(row);assert.equal(Object.hasOwn(row,'family_id'),false);assert.deepEqual(healthWriteContext({expectedScope:scope,expectedRecord:row},family,actor,kind),row);
 for(const patch of [{expectedScope:{...scope,actorId:'other'}},{expectedScope:{...scope,familyId:id}},{expectedRecord:{}},{expectedRecord:{...row,auth_user_id:actor}}])assert.throws(()=>healthWriteContext({expectedScope:scope,expectedRecord:row,...patch},family,actor,kind),HealthRecordWriteError);}
 for(const action of ['__proto__','constructor','toString','create_sos','respond_sos'])assert.equal(healthOrdinaryKind('POST',{action}),null);
});
test('create/edit/delete confirms exactly one scoped row before one audit; safe response',async()=>{
 for(const kind of Object.keys(rows))for(const deletion of [false,true]){const order=[],changes=deletion?{}:kind==='profile'?{allergies:'QA only'}:{notes:'QA edit'};
 if(kind==='medication'&&!deletion){delete changes.notes;changes.instructions='QA edit';}
 const result=await healthRecordWrite(opts(kind,{changes,deletion,write:async next=>{order.push('write');return[{...rows[kind],...next}];},audit:async saved=>{order.push('audit');assert.equal(saved,id);}}));assert.deepEqual(order,['write','audit']);assert.equal(result.auditPending,false);assert.equal(result.id,id);if(!deletion)assert.equal(Object.hasOwn(result.record,'auth_user_id'),false);else assert.equal(Object.hasOwn(result,'record'),false);}
 for(const kind of Object.keys(rows)){const result=await healthRecordWrite(opts(kind,{expected:null,existing:null,changes:{},write:async next=>[{...rows[kind],...next}]}));assert.equal(result.id,id);}
});
test('no-change has no writes/audits; stale expected scope/content/microsecond version blocks mutation',async()=>{
 let calls=0;for(const kind of Object.keys(rows)){const result=await healthRecordWrite(opts(kind,{write:async()=>calls++,audit:async()=>calls++}));assert.equal(result.noChange,true);const key=kind==='measurement'?'notes':'updated_at';await assert.rejects(healthRecordWrite(opts(kind,{expected:{...healthPublicRecord(kind,rows[kind]),[key]:kind==='measurement'?'other':'2026-10-14T08:00:00.123455Z'},write:async()=>calls++})),e=>e.code==='HEALTH_RECORD_CHANGED');}
 assert.equal(calls,0);await assert.rejects(healthRecordWrite(opts('profile',{expected:null})),e=>e.code==='HEALTH_RECORD_CHANGED');await assert.rejects(healthRecordWrite(opts('medication',{existing:{...rows.medication,...owner,auth_user_id:'other'}})),e=>e.code==='HEALTH_WRITE_CONTEXT');
});
test('measurement CAS filters cover all mutable fields and escape PostgREST quotes/backslashes',()=>{
 const q=healthRecordFilter('measurement',healthPublicRecord('measurement',rows.measurement),family,actor);for(const key of ['id','family_id','auth_user_id','measurement_type','value_primary','value_secondary','unit','measured_at','notes','created_at'])assert.ok(q.has(key));assert.equal(q.get('value_secondary'),'is.null');assert.match(q.get('notes'),/\\"quoted\\"/);assert.match(q.get('notes'),/\\\\/);assert.equal(healthRecordFilter('profile',rows.profile,family,actor).get('updated_at'),'eq."'+stamp+'"');
});
test('empty CAS conflicts and known rejection differ from lost/malformed/wrong-owner replies; no phantom audit/retry',async()=>{
 let audits=0;for(const [write,code]of [[async()=>[],'HEALTH_RECORD_CHANGED'],[async()=>null,'HEALTH_WRITE_UNKNOWN'],[async()=>[rows.medication,rows.medication],'HEALTH_WRITE_UNKNOWN'],[async()=>[{...rows.medication,family_id:id}],'HEALTH_WRITE_UNKNOWN'],[async()=>{throw {status:400};},'HEALTH_WRITE_REJECTED'],[async()=>{throw {status:408};},'HEALTH_WRITE_UNKNOWN'],[async()=>{throw Error('lost');},'HEALTH_WRITE_UNKNOWN']])await assert.rejects(healthRecordWrite(opts('medication',{changes:{status:'paused'},write,audit:async()=>audits++})),e=>e.code===code);assert.equal(audits,0);
});
test('returned value/version mismatch never confirms; numeric strings/ISO UTC equivalents validate',async()=>{
 await assert.rejects(healthRecordWrite(opts('measurement',{changes:{value_primary:66},write:async()=>[rows.measurement]})),e=>e.code==='HEALTH_WRITE_UNKNOWN');
 const r=await healthRecordWrite(opts('profile',{changes:{weight_kg:66},write:async next=>[{...rows.profile,...next,weight_kg:'66.00',updated_at:String(next.updated_at).replace('Z','+00:00')}]}));assert.equal(r.record.weight_kg,'66.00');assert.ok(Date.parse(r.record.updated_at)>Date.parse(stamp));
});
test('confirmed audit failure remains 202 pending, never false failure or compensation',async()=>{
 let writes=0,audits=0;const r=await healthRecordWrite(opts('medication',{changes:{status:'paused'},write:async next=>{writes++;return[{...rows.medication,...next}];},audit:async()=>{audits++;throw Error('simulated outage');}}));assert.deepEqual([writes,audits],[1,1]);assert.equal((await healthRecordWriteResponse(r).json()).auditPending,true);assert.equal(healthRecordWriteResponse(r).status,202);
 const body={action:'update_status',expectedScope:scope,expectedRecord:healthPublicRecord('medication',rows.medication),data:{entity:'medication',id,status:'paused'}};assert.equal(healthRecordAcknowledged('POST',body,202,r),true);assert.equal(healthRecordAcknowledged('POST',body,200,r),false);
});
test('client acknowledgement validates kind/scope/id/requested fields and pending flag; excludes SOS',async()=>{
 const r=await healthRecordWrite(opts('measurement',{changes:{notes:'QA new'}})),body={kind:'measurement',recordId:id,expectedScope:scope,expectedRecord:healthPublicRecord('measurement',rows.measurement),data:{notes:'QA new'}};assert.equal(healthRecordAcknowledged('PATCH',body,200,r),true);
 for(const patch of [{scope:{...scope,actorId:'other'}},{id:family},{record:{...r.record,notes:'other'}},{record:{...r.record,auth_user_id:actor}},{auditPending:'false'},{noChange:'false'},{outcomeUnknown:true}])assert.equal(healthRecordAcknowledged('PATCH',body,200,{...r,...patch}),false);
 const create={action:'create_measurement',expectedScope:scope,expectedRecord:null,data:{notes:'QA new'}};assert.equal(healthRecordAcknowledged('POST',create,201,r),true);assert.equal(healthRecordAcknowledged('POST',create,200,r),false);
 assert.equal(healthRecordFeedback('/api/health/records',503,{},'en','POST',{action:'create_sos'}),null);
});
test('cancel/rejected/unknown outcomes never automatically retry, and bilingual feedback is specific',async()=>{
 for(const [status,raw,kind]of [[499,{},'cancelled'],[400,{},'rejected'],[409,{},'rejected'],[503,{},'unknown'],[408,{},'unknown'],[200,{},'unknown']]){let calls=0;const r=await readHealthRecordMutation(async()=>{calls++;return Response.json(raw,{status});},'PATCH',{kind:'measurement'});assert.equal(r.kind,kind);assert.equal(calls,1);}
 assert.equal((await readHealthRecordMutation(async()=>{throw Error('offline');},'POST',{})).kind,'unknown');for(const locale of ['bn','en']){assert.equal(healthRecordFeedback('/api/health/records',200,{},locale,'PATCH',{kind:'measurement'}).kind,'info');assert.equal(healthRecordFeedback('/api/health/records',409,{code:'HEALTH_RECORD_CHANGED'},locale,'PATCH',{kind:'measurement'}).kind,'error');}
});
test('UI/API/modal wiring retains cancel/read guards and records only a session marker, never medical drafts',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),ui=read('app/health-center.tsx'),api=read('app/api/health/records/route.ts'),modal=read('components/action-modal-provider.tsx');
 assert.match(ui,/if\(verificationRef.current\)return false/);assert.match(ui,/expectedScope:captured.scope,expectedRecord:expected/);assert.match(ui,/sessionStorage.setItem\(healthReviewKey\(captured.scope\),"1"\)/);assert.match(ui,/if\(outcome.kind==="cancelled"\)return false/);assert.match(ui,/if\(outcome.kind==="unknown"\)/);assert.match(ui,/function reviewHealthOutcome/);assert.match(ui,/editorExpected.current=healthPublicRecord\(kind,item\)/);assert.match(api,/return await writeOrdinaryHealth/);assert.match(api,/Prefer:"return=representation"/);assert.doesNotMatch(api,/resolution=merge-duplicates|Legacy implementation/);assert.match(modal,/healthRecordFeedback\(url.pathname/);assert.match(modal,/noticeResult \?\? healthResult/);
});

// Invoke the actual route handlers with an in-memory REST adapter. These test
// server wiring/fault branches, not production database faults or browser QA.
function routeHarness({auditFail=false,lostWrite=false}={}){
 const db=new Map(Object.values(healthWrites.healthRecordTables).map(t=>[t,[]])),calls=[];let serial=100;
 class RequestError extends Error{constructor(status){super('Synthetic rejection');this.status=status;}}
 const rest=async(path,init={})=>{
  const [table,query='']=path.split('?'),method=init.method??'GET',q=new URLSearchParams(query);calls.push({table,method,query});
  if(table==='audit_logs'){if(auditFail)throw Error('Simulated audit outage');return[{id:'30000000-0000-4000-8000-000000000001',...JSON.parse(init.body)}];}
  const all=db.get(table);assert.ok(all,'Only expected health tables');
  const selected=all.filter(row=>[...q].every(([key,filter])=>{if(['select','limit'].includes(key))return true;if(filter==='is.null')return row[key]===null;assert.ok(filter.startsWith('eq.'));let expected=filter.slice(3);if(expected.startsWith('"'))expected=expected.slice(1,-1).replace(/\\(.)/g,'$1');return String(row[key])===expected;}));
  if(method==='GET')return structuredClone(selected);
  if(method==='POST'){
   const kind=Object.entries(healthWrites.healthRecordTables).find(([,t])=>t===table)[0],data=JSON.parse(init.body),row={...rows[kind],...data,id:'40000000-0000-4000-8000-'+String(serial++).padStart(12,'0')};all.push(row);if(lostWrite)throw Error('Simulated reply lost after insert');return[structuredClone(row)];
  }
  if(method==='PATCH'){const data=JSON.parse(init.body);selected.forEach(r=>Object.assign(r,data));return structuredClone(selected);}
  if(method==='DELETE'){db.set(table,all.filter(r=>!selected.includes(r)));return structuredClone(selected);}
  throw Error('Unexpected method');
 };
 const exports={};const deps={
  '@/app/chatgpt-auth':{getChatGPTUser:async()=>({userId:actor})},
  '@/lib/family-access':{getActiveFamilyMembership:async()=>({family_id:family,role:'owner'}),canManageHealth:()=>true},
  '@/lib/family-chat':{getChatAuthorName:async()=> 'QA Owner'},
  '../route':{healthErrorResponse:()=>Response.json({error:'Synthetic backend error'},{status:500})},
  '@/lib/supabase-rest':{supabaseRest:rest,SupabaseRequestError:RequestError},
  '@/lib/health-record-write':healthWrites,'@/lib/health-validation':healthValidation,
  '@/lib/health-sos-write':healthSosWrites,
 };
 const source=readFileSync(new URL('../app/api/health/records/route.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require',compiled)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];});
 const call=async(method,body)=>{const response=await exports[method](new Request('http://localhost/api/health/records',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
 return{call,db,calls};
}
const validData={
 profile:{bloodGroup:'O+',dateOfBirth:'',heightCm:'170',weightKg:'65',conditions:'',allergies:'',emergencyNotes:'',doctorName:'',doctorPhone:'',emergencyContactName:'',emergencyContactPhone:'',donorAvailable:false,lastDonationDate:'',visibility:'private'},
 medication:{medicineName:'QA medicine',dosage:'Recorded label',frequency:'Recorded schedule',reminderTimes:['08:00'],startDate:'2026-10-14',endDate:'',instructions:'',prescribingDoctor:''},
 appointment:{title:'QA appointment',doctorName:'',facility:'',scheduledAt:'2026-10-14T08:00:00Z',reminderMinutes:60,notes:''},
 measurement:{measurementType:'weight',valuePrimary:'65',valueSecondary:'',unit:'kg',measuredAt:'2026-10-14T08:00:00Z',notes:'QA fixture'},
};
test('actual route handlers simulate complete profile/medicine/appointment/measurement lifecycles and acknowledgement',async()=>{
 const h=routeHarness();
 for(const kind of Object.keys(rows)){
  const create={action:kind==='profile'?'save_profile':'create_'+kind,data:validData[kind],expectedScope:scope,expectedRecord:null};
  const first=await h.call('POST',create);assert.equal(first.status,kind==='profile'?200:201);assert.equal(healthRecordAcknowledged('POST',create,first.status,first.body),true);
  const saved=first.body.record;
  const data={...validData[kind],...(kind==='profile'?{allergies:'QA edited'}:kind==='medication'?{instructions:'QA edited'}:{notes:'QA edited'})};
  const edit=kind==='profile'?{action:'save_profile',data,expectedScope:scope,expectedRecord:saved}:{kind,recordId:saved.id,data,expectedScope:scope,expectedRecord:saved};
  const method=kind==='profile'?'POST':'PATCH',changed=await h.call(method,edit);assert.equal(changed.status,200);assert.equal(healthRecordAcknowledged(method,edit,changed.status,changed.body),true);
  const repeat={...edit,expectedRecord:changed.body.record};const before=h.calls.length,noChange=await h.call(method,repeat);assert.equal(noChange.body.noChange,true);assert.ok(h.calls.slice(before).every(c=>c.method==='GET'));
  if(kind==='profile')continue;
  if(kind!=='measurement'){
   const status={action:'update_status',data:{entity:kind,id:saved.id,status:kind==='medication'?'paused':'cancelled'},expectedScope:scope,expectedRecord:changed.body.record};
   const updated=await h.call('POST',status);assert.equal(updated.status,200);assert.equal(healthRecordAcknowledged('POST',status,200,updated.body),true);changed.body.record=updated.body.record;
  }
  const remove={kind,recordId:saved.id,expectedScope:scope,expectedRecord:changed.body.record},removed=await h.call('DELETE',remove);assert.equal(removed.status,200);assert.equal(healthRecordAcknowledged('DELETE',remove,200,removed.body),true);assert.equal(h.db.get(healthWrites.healthRecordTables[kind]).length,0);
 }
});
test('actual route simulation distinguishes committed audit-pending/unknown and rejects invalid context before REST',async()=>{
 const body={action:'create_appointment',data:validData.appointment,expectedScope:scope,expectedRecord:null};
 for(const [options,status,code]of [[{auditFail:true},202,'HEALTH_AUDIT_PENDING'],[{lostWrite:true},503,'HEALTH_WRITE_UNKNOWN']]){const h=routeHarness(options),r=await h.call('POST',body);assert.equal(r.status,status);assert.equal(r.body.code,code);assert.equal(h.db.get('health_appointments').length,1);assert.equal(h.calls.filter(c=>c.table==='health_appointments'&&c.method==='POST').length,1);}
 const h=routeHarness();for(const patch of [{expectedScope:{...scope,actorId:'other'}},{expectedRecord:{}},{data:{...validData.appointment,title:'x'.repeat(181)}},{data:{...validData.appointment,title:[]}}]){const r=await h.call('POST',{...body,...patch});assert.ok([400,409].includes(r.status));assert.equal(h.calls.length,0);}
 const malformed=await h.call('POST',null);assert.equal(malformed.status,400);assert.equal(h.calls.length,0);
});
