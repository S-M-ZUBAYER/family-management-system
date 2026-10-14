import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as sos from '../lib/health-sos-write.ts';
import * as ordinary from '../lib/health-record-write.ts';
import * as validation from '../lib/health-validation.ts';
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000092',newId='20000000-0000-4000-8000-000000000093',actor='qa-owner',scope={familyId:family,actorId:actor},stamp='2026-10-14T10:00:00.123456Z';
const row={id,family_id:family,reporter_user_id:actor,reporter_name:'QA Owner',alert_type:'other',message:'In-memory QA only; never sent',preferred_contact:null,latitude:null,longitude:null,location_accuracy_m:null,location_label:null,status:'active',acknowledged_by_user_id:null,acknowledged_by_name:null,acknowledged_at:null,resolved_by_user_id:null,resolved_at:null,resolution_note:null,created_at:stamp,updated_at:stamp};
const alert=sos.healthSosAlertPublic({...row,is_reporter:true}),createBody={action:'create_sos',expectedScope:scope,expectedAlert:null,data:{alertType:'other',message:row.message}},closeBody={action:'update_sos',expectedScope:scope,expectedAlert:alert,data:{alertId:id,status:'resolved',note:'QA closed'}},responseBody={action:'respond_sos',expectedScope:scope,expectedAlert:alert,data:{alertId:id,responseType:'update',note:'QA response'}};
function harness(options={}){
 const state={alerts:options.empty?[]:[{...row,...options.rowPatch}],responses:[],audits:[],calls:[],authorization:0};
 class RestError extends Error{constructor(status){super('Synthetic rejection');this.status=status;}}
 const rest=async(path,init={})=>{
  const[table,query='']=path.split('?'),method=init.method??'GET',q=new URLSearchParams(query);state.calls.push({table,method,q});
  if(table==='audit_logs'){if(options.auditFail)throw Error('simulated audit');const data=JSON.parse(init.body);state.audits.push(data);return[{...data,id:newId}];}
  const rows=table==='health_sos_alerts'?state.alerts:state.responses;
  const matches=rows.filter(r=>[...q].every(([key,value])=>['select','limit'].includes(key)||String(r[key])===value.slice(3)));
  if(method==='GET')return structuredClone(matches);
  const data=JSON.parse(init.body);
  if(method==='POST'){const created=table==='health_sos_alerts'?{...row,...data}:data;rows.push(created);if(options.lostInsert)throw Error('response lost after commit');if(options.rejectedInsert){rows.pop();throw new RestError(400);}return options.badReturn?null:[structuredClone(created)];}
  if(method==='PATCH'){
   if(options.parentFail&&data.status==='acknowledged')throw Error('simulated parent outage');
   if(options.parentRace&&data.status==='acknowledged'){state.alerts[0].status='cancelled';return[];}
   if(options.emptyPatch)return[];
   for(const r of matches)Object.assign(r,data);
   if(options.lostPatch)throw Error('response lost after commit');return options.badReturn?null:structuredClone(matches);
  }
  throw Error('No deletes/external services allowed');
 };
 const authorize=async()=>{state.authorization++;if(options.revokeAt===state.authorization)throw new sos.HealthSosWriteError('HEALTH_SOS_CONTEXT',409);};
 const run=body=>sos.writeHealthSos({rest,input:sos.healthSosInput(body,scope),authorName:'QA Owner',canManage:options.canManage??false,authorize,rejected:e=>e instanceof RestError&&e.status>=400&&e.status<500&&e.status!==408,newId});
 return{state,rest,run,authorize,RestError};
}
test('strict SOS context/expected alert/action/data limits, type/location and no coercion/truncation',()=>{
 for(const b of [createBody,closeBody,responseBody])assert.ok(sos.healthSosInput(b,scope));
 for(const patch of [{expectedScope:{...scope,actorId:'other'}},{expectedScope:{...scope,familyId:id}},{expectedAlert:{}},{action:'__proto__'},{data:{...createBody.data,message:'x'.repeat(1001)}},{data:{...createBody.data,message:['QA']}},{data:{...createBody.data,preferredContact:'x'.repeat(51)}},{data:{...createBody.data,latitude:91,longitude:0}},{data:{...createBody.data,unknown:true}},{family_id:family}])assert.throws(()=>sos.healthSosInput({...createBody,...patch},scope),sos.HealthSosWriteError);
 assert.throws(()=>sos.healthSosInput({...responseBody,data:{...responseBody.data,responseType:'resolved'}}));assert.throws(()=>sos.healthSosInput({...closeBody,expectedAlert:{...alert,status:'resolved'}}));
});
test('public SOS projection validates complete linked/time/coordinate fields without leaking identities',()=>{
 assert.ok(alert);for(const k of ['family_id','reporter_user_id','resolved_by_user_id'])assert.equal(Object.hasOwn(alert,k),false);
 for(const patch of [{updated_at:'bad'},{message:'x'},{is_reporter:'true'},{longitude:1},{latitude:91,longitude:0},{location_accuracy_m:-1},{acknowledged_by_name:undefined}])assert.equal(sos.healthSosAlertPublic({...alert,...patch}),null);
 assert.ok(sos.healthSosAlertPublic({...alert,latitude:'0.0000000',longitude:0,location_accuracy_m:0}));
});
test('create confirms own scoped requested alert before exactly one audit and explicit safe acknowledgement',async()=>{
 const h=harness({empty:true}),r=await h.run(createBody);assert.equal(r.id,newId);assert.equal(r.record.is_reporter,true);assert.equal(r.record.status,'active');assert.equal(h.state.alerts.length,1);assert.equal(h.state.audits.length,1);assert.equal(h.state.audits[0].action,'health_sos_created');assert.equal(sos.healthSosAcknowledged(createBody,201,r),true);assert.equal(h.state.authorization,1);
});
test('close uses original status/version/reporter CAS and permission, preserves immutable alert fields',async()=>{
 for(const status of ['resolved','cancelled']){const h=harness(),body={...closeBody,data:{...closeBody.data,status}},r=await h.run(body);assert.equal(r.record.status,status);assert.equal(r.record.message,row.message);assert.equal(h.state.alerts[0].resolved_by_user_id,actor);const q=h.state.calls.find(c=>c.method==='PATCH').q;assert.equal(q.get('updated_at'),'eq.'+stamp);assert.equal(q.get('reporter_user_id'),'eq.'+actor);assert.equal(sos.healthSosAcknowledged(body,200,r),true);}
 const otherRow={...row,reporter_user_id:'other'},otherAlert=sos.healthSosAlertPublic({...otherRow,is_reporter:false}),body={...closeBody,expectedAlert:otherAlert};await assert.rejects(harness({rowPatch:otherRow}).run(body),e=>e.code==='HEALTH_SOS_FORBIDDEN');assert.equal((await harness({rowPatch:otherRow,canManage:true}).run(body)).record.is_reporter,false);
});
test('stale content/microsecond version and closed/missing/foreign family deny before writes',async()=>{
 for(const patch of [{message:'changed in browser'},{updated_at:'2026-10-14T10:00:00.123455Z'},{is_reporter:false}]){const h=harness();await assert.rejects(h.run({...closeBody,expectedAlert:{...alert,...patch}}),e=>e.code==='HEALTH_SOS_CHANGED');assert.ok(h.state.calls.every(c=>c.method==='GET'));}
 for(const [options,code]of [[{empty:true},'HEALTH_SOS_NOT_FOUND'],[{rowPatch:{status:'cancelled'}},'HEALTH_SOS_CLOSED'],[{rowPatch:{family_id:newId}},'HEALTH_SOS_NOT_FOUND']])await assert.rejects(harness(options).run(responseBody),e=>e.code===code);
});
test('committed-but-lost/malformed primary reply becomes unknown, never audits or compensates/retries',async()=>{
 for(const body of [createBody,closeBody,responseBody])for(const options of [{lostInsert:true},{lostPatch:true},{badReturn:true}]){
  if(options.lostInsert&&body.action==='update_sos'||options.lostPatch&&body.action!=='update_sos')continue;
  const h=harness(options);await assert.rejects(h.run(body),e=>e.code==='HEALTH_SOS_UNKNOWN');assert.equal(h.state.audits.length,0);assert.ok(h.state.calls.every(c=>c.method!=='DELETE'));assert.equal(h.state.calls.filter(c=>['POST','PATCH'].includes(c.method)).length,1);
 }
});
test('empty conditional close conflicts and known database rejection differs from ambiguity',async()=>{
 await assert.rejects(harness({emptyPatch:true}).run(closeBody),e=>e.code==='HEALTH_SOS_CHANGED');await assert.rejects(harness({rejectedInsert:true}).run(createBody),e=>e.code==='HEALTH_SOS_REJECTED');
});
test('confirmed response parent acknowledgement follows saved child, not replacing earlier responder',async()=>{
 const h=harness(),r=await h.run(responseBody);assert.equal(h.state.responses.length,1);assert.equal(r.record.is_mine,true);assert.equal(r.record.alert_id,id);assert.equal(h.state.alerts[0].status,'acknowledged');assert.equal(r.parentPending,false);assert.equal(sos.healthSosAcknowledged(responseBody,201,r),true);
 const previous={...row,status:'acknowledged',acknowledged_by_name:'First responder',acknowledged_at:stamp},body={...responseBody,expectedAlert:sos.healthSosAlertPublic({...previous,is_reporter:true})},ack=harness({rowPatch:previous});await ack.run(body);assert.equal(ack.state.alerts[0].acknowledged_by_name,'First responder');assert.equal(ack.state.calls.filter(c=>c.method==='PATCH').length,0);
});
test('response stays confirmed with pending parent after outage/concurrent close, no reopen or delete',async()=>{
 for(const options of [{parentFail:true},{parentRace:true},{revokeAt:2}]){const h=harness(options),r=await h.run(responseBody);assert.equal(r.parentPending,true);assert.equal(h.state.responses.length,1);assert.equal(h.state.audits.length,1);assert.equal(sos.healthSosAcknowledged(responseBody,202,r),true);assert.equal(sos.healthSosAcknowledged(responseBody,201,r),false);if(options.parentRace)assert.equal(h.state.alerts[0].status,'cancelled');assert.ok(h.state.calls.every(c=>c.method!=='DELETE'));}
});
test('audit failure after confirmed create/response/close is pending, never a false save failure',async()=>{
 for(const body of [createBody,closeBody,responseBody]){const h=harness({auditFail:true}),r=await h.run(body);assert.equal(r.auditPending,true);assert.equal(r.code,'HEALTH_SOS_PENDING');assert.equal(sos.healthSosAcknowledged(body,202,r),true);assert.equal(sos.healthSosAcknowledged(body,body.action==='update_sos'?200:201,r),false);}
});
test('final access rejection before write leaves all records/audits unchanged',async()=>{
 for(const body of [createBody,closeBody,responseBody]){const h=harness({revokeAt:1}),before=structuredClone(h.state.alerts);await assert.rejects(h.run(body),e=>e.code==='HEALTH_SOS_CONTEXT');assert.deepEqual(h.state.alerts,before);assert.equal(h.state.responses.length,0);assert.equal(h.state.audits.length,0);}
});
test('client acknowledgement rejects wrong kind/scope/ID/flags/status/parent and raw private fields',async()=>{
 const r=await harness().run(closeBody);for(const patch of [{success:'true'},{action:'create_sos'},{scope:{...scope,actorId:'other'}},{id:newId},{parentPending:true},{auditPending:'false'},{record:{...r.record,reporter_user_id:actor}},{record:{...r.record,status:'active'}},{outcomeUnknown:true}])assert.equal(sos.healthSosAcknowledged(closeBody,200,{...r,...patch}),false);
});
test('client cancellation/known rejection/unknown/malformed success never automatically replays',async()=>{
 for(const [status,payload,kind]of [[499,{},'cancelled'],[409,{code:'HEALTH_SOS_CHANGED'},'rejected'],[503,{},'unknown'],[408,{},'unknown'],[201,{},'unknown']]){let count=0;assert.equal((await sos.readHealthSosMutation(async()=>{count++;return Response.json(payload,{status});},createBody)).kind,kind);assert.equal(count,1);}
 assert.equal((await sos.readHealthSosMutation(async()=>{throw Error('offline');},createBody)).kind,'unknown');
});
test('bilingual pending/unknown feedback never promises dispatch, and other health actions are untouched',async()=>{
 for(const locale of ['bn','en'])for(const body of [createBody,closeBody,responseBody]){assert.equal(sos.healthSosFeedback('/api/health/records',503,{},locale,'POST',body).kind,'info');assert.ok(sos.healthSosWriteCopy('HEALTH_SOS_PENDING',locale));}assert.match(sos.healthSosWriteCopy('HEALTH_SOS_UNKNOWN','en'),/does not call emergency/);assert.equal(sos.healthSosFeedback('/api/health/records',503,{},'en','POST',{action:'create_medication'}),null);
});
function route(h){
 const deps={'@/app/chatgpt-auth':{getChatGPTUser:async()=>({userId:actor})},'@/lib/family-access':{getActiveFamilyMembership:async()=>({family_id:family,role:'owner'}),canManageHealth:()=>true},'@/lib/family-chat':{getChatAuthorName:async()=> 'QA Owner'},'../route':{healthErrorResponse:()=>Response.json({error:'Synthetic backend error'},{status:500})},'@/lib/supabase-rest':{supabaseRest:h.rest,SupabaseRequestError:h.RestError},'@/lib/health-record-write':ordinary,'@/lib/health-validation':validation,'@/lib/health-sos-write':sos};
 const source=readFileSync(new URL('../app/api/health/records/route.ts',import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};new Function('exports','require',compiled)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];});return async body=>{const r=await exports.POST(new Request('http://localhost/api/health/records',{method:'POST',body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};};
}
test('actual route handlers simulate all SOS actions, pending and no-write context denial',async()=>{
 for(const body of [createBody,closeBody,responseBody]){const h=harness(),r=await route(h)(body);assert.equal(r.status,body.action==='update_sos'?200:201);assert.equal(sos.healthSosAcknowledged(body,r.status,r.body),true);}
 const pending=await route(harness({auditFail:true}))(responseBody);assert.equal(pending.status,202);assert.equal(pending.body.auditPending,true);
 const h=harness(),denied=await route(h)({...createBody,expectedScope:{...scope,actorId:'other'}});assert.equal(denied.status,409);assert.equal(h.state.calls.length,0);
});
test('UI/API/modal wiring uses original response alert, scoped verification and no legacy SOS mutations',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),ui=read('app/health-center.tsx'),api=read('app/api/health/records/route.ts'),modal=read('components/action-modal-provider.tsx');assert.match(api,/writeHealthSos/);assert.doesNotMatch(api,/await respondHealthSos|await closeHealthSos/);assert.match(ui,/responseExpected.current=alert/);assert.match(ui,/readHealthSosMutation/);assert.match(ui,/expectedScope:captured.scope,expectedAlert/);assert.match(ui,/Never store SOS location\/contact\/draft/);assert.match(ui,/if\(outcome.kind==="cancelled"\)return false/);assert.match(modal,/healthSosFeedback/);assert.match(modal,/sosResult/);
 const action=ui.slice(ui.indexOf('async function postAction'),ui.indexOf('async function saveProfile'));assert.ok(action.indexOf('sessionStorage.setItem')<action.indexOf('if(!healthMounted.current'));assert.match(action,/if\(outcome.kind==="unknown"\)try/);
});
