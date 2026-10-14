// Rejection/read-only only. NEVER sends a valid SOS or changes an existing alert.
import assert from 'node:assert/strict';
import {healthReadSnapshot} from '../lib/health-read.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.username||origin.password||!['http:','https:'].includes(origin.protocol))throw Error('Credential-free loopback required.');
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
async function snapshot(family){const r=await fetch(new URL('/api/health',origin),{headers:{Cookie:'__sites_local_auth=1; fms_active_family='+family},signal:AbortSignal.timeout(25000)});eq(r.status,200);const p=await r.json();ok(healthReadSnapshot(p));return p;}
async function denied(family,body,status,code,signed=true){const r=await fetch(new URL('/api/health/records',origin),{method:'POST',headers:{'Content-Type':'application/json',...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+family}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});eq(r.status,status);const p=await r.json();if(code)eq(p.code,code);eq(p.success===true,false);eq(p.outcomeUnknown===true,false);}
const before=[];for(const family of families)before.push(await snapshot(family));
const fakeId=crypto.randomUUID();for(const p of before)eq(p.sosAlerts.some(a=>a.id===fakeId),false);
const alert={id:fakeId,reporter_name:'QA missing only',alert_type:'other',message:'Synthetic absent alert; never sent',preferred_contact:null,latitude:null,longitude:null,location_accuracy_m:null,location_label:null,status:'active',acknowledged_by_name:null,acknowledged_at:null,resolved_at:null,resolution_note:null,created_at:'2026-10-14T10:00:00Z',updated_at:'2026-10-14T10:00:00Z',is_reporter:true};
for(let i=0;i<families.length;i++){
 const family=families[i],scope=before[i].scope;
 const bodies=[{action:'create_sos',data:{alertType:'other',message:'QA rejected scope only; must never be sent'},expectedScope:scope,expectedAlert:null},{action:'respond_sos',data:{alertId:fakeId,responseType:'update',note:'QA missing only'},expectedScope:scope,expectedAlert:alert},{action:'update_sos',data:{alertId:fakeId,status:'resolved',note:'QA missing only'},expectedScope:scope,expectedAlert:alert}];
 for(const body of bodies){await denied(family,{...body,expectedScope:{...scope,actorId:'not-this-owner'}},409,'HEALTH_SOS_CONTEXT');await denied(family,{...body,expectedScope:{...scope,familyId:families[1-i]}},409,'HEALTH_SOS_CONTEXT');await denied(family,{...body,expectedAlert:{}},400,'HEALTH_SOS_INPUT');await denied(family,body,401,null,false);}
 // Only invalid create data is sent with correct context; no valid create call.
 for(const data of [{alertType:'other',message:'x'},{alertType:'invalid',message:'QA rejected only'},{alertType:'other',message:'x'.repeat(1001)}])await denied(family,{...bodies[0],data},400,'HEALTH_SOS_INPUT');
 await denied(family,{...bodies[0],data:{alertType:'other',message:'QA invalid location only',latitude:91,longitude:0}},400,'HEALTH_SOS_LOCATION');
 for(const body of bodies.slice(1)){await denied(family,body,404,'HEALTH_SOS_NOT_FOUND');await denied(family,{...body,expectedAlert:{...alert,status:'resolved'}},409,'HEALTH_SOS_CLOSED');}
}
for(let i=0;i<families.length;i++)eq(await snapshot(families[i]),before[i]);
console.log(JSON.stringify({checks,families:2,snapshotsUnchanged:true,sosSent:0,existingAlertsOrResponsesChanged:0,auditOrDeliveryOrSqlChanges:0,actualPositiveEmergencyOrBrowserOrRealUserAcceptance:false}));
