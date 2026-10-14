// Only rejection and reads. Never creates/edits/deletes records or sends SOS.
import assert from 'node:assert/strict';
import {healthReadSnapshot} from '../lib/health-read.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.username||origin.password||!['http:','https:'].includes(origin.protocol))throw Error('Credential-free loopback required.');
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
async function get(family){const r=await fetch(new URL('/api/health',origin),{headers:{Cookie:'__sites_local_auth=1; fms_active_family='+family},signal:AbortSignal.timeout(25000)});eq(r.status,200);const p=await r.json();ok(healthReadSnapshot(p));return p;}
async function denied(family,method,body,status,code,signed=true){const r=await fetch(new URL('/api/health/records',origin),{method,headers:{'Content-Type':'application/json',...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+family}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});eq(r.status,status);const p=await r.json();if(code)eq(p.code,code);eq(p.outcomeUnknown===true,false);eq(p.success===true,false);}
const before=[];for(const family of families){const p=await get(family);before.push(p);const scope=p.scope;
 for(const action of ['save_profile','create_medication','create_appointment','create_measurement','update_status']){
  const data=action==='update_status'?{entity:'medication',id:'20000000-0000-4000-8000-000000000090',status:'paused'}:{};
  await denied(family,'POST',{action,data,expectedScope:{...scope,actorId:'not-this-owner'},expectedRecord:null},409,'HEALTH_WRITE_CONTEXT');
  await denied(family,'POST',{action,data,expectedScope:scope},400,'HEALTH_WRITE_EXPECTATION');
 }
 for(const method of ['PATCH','DELETE']){
  await denied(family,method,{kind:'measurement',recordId:'20000000-0000-4000-8000-000000000090',expectedScope:{...scope,familyId:families.find(id=>id!==family)},expectedRecord:null},409,'HEALTH_WRITE_CONTEXT');
  await denied(family,method,{kind:'measurement',recordId:'20000000-0000-4000-8000-000000000090',expectedScope:scope,expectedRecord:null},400,'HEALTH_WRITE_EXPECTATION');
 }
 for(const method of ['POST','PATCH','DELETE']){await denied(family,method,null,400,'HEALTH_WRITE_EXPECTATION');await denied(family,method,{},401,null,false);}
}
for(let i=0;i<families.length;i++)eq(await get(families[i]),before[i]);
console.log(JSON.stringify({checks,families:2,privateSnapshotsUnchanged:true,mutationsPerformed:0,sosSent:0,sqlOrFilesChanged:false,positiveSaveOrBrowserAcceptance:false}));
