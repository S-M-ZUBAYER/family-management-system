// Read-only loopback QA. No records, files, audits or SQL are changed.
import assert from 'node:assert/strict';
import {readEvents,eventSafeSnapshot} from '../lib/event-read.ts';
import {NoticeRequestGate} from '../lib/notice-write-outcome.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},valid=a=>{assert.ok(a);checks++;};
async function request(family,init={},signed=true,path='/api/events'){return fetch(new URL(path,origin),{...init,signal:init.signal??AbortSignal.timeout(20000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+family}:{}),...init.headers}});}
async function read(family){const r=await request(family);equal(r.status,200);const p=await r.json();valid(eventSafeSnapshot(p));equal(p.family.id,family);equal(p.migrationRequired,false);return p;}
function observer(){const state={family:'old family',events:['old'],rsvps:['old'],comments:['old'],media:['old'],canManage:true,loading:false,loaded:0,starts:0,settles:0,errors:[]};
return{state,start:()=>{Object.assign(state,{family:null,events:[],rsvps:[],comments:[],media:[],canManage:false,loading:true});state.starts++;},loaded:p=>{Object.assign(state,{family:p.family,events:p.events,rsvps:p.rsvps,comments:p.comments,media:p.media,canManage:p.permissions.canManage&&!p.migrationRequired});state.loaded++;},setup:()=>{throw Error('Unexpected setup.');},failed:e=>state.errors.push(e.code),settled:()=>{state.loading=false;state.settles++;}};}
const snapshots=[];
for(const family of families){
const before=await read(family);snapshots.push(before);const ob=observer();let requests=0;
equal(await readEvents({gate:new NoticeRequestGate(),...ob,expectedFamilyId:family,request:init=>{requests++;equal(init.cache,'no-store');valid(init.signal);return request(family,init);}}),true);
equal(requests,1);equal(ob.state.starts,1);equal(ob.state.loaded,1);equal(ob.state.settles,1);equal(ob.state.errors,[]);equal(ob.state.loading,false);equal(ob.state.family,before.family);
for(const key of ['events','rsvps','comments','media'])equal(ob.state[key],before[key]);
for(const row of [...ob.state.events,...ob.state.rsvps,...ob.state.comments,...ob.state.media])for(const field of ['family_id','created_by_user_id','auth_user_id','storage_key','uploaded_by_user_id'])equal(Object.hasOwn(row,field),false);
}
const gate=new NoticeRequestGate(),unsigned=observer();let calls=0;
equal(await readEvents({gate,...unsigned,expectedFamilyId:families[0],request:init=>{calls++;return request(families[0],init,false);}}),false);
equal(calls,1);equal(unsigned.state.errors,['EVENT_SIGN_IN_REQUIRED']);equal(unsigned.state.canManage,false);equal(unsigned.state.family,null);equal(unsigned.state.loading,false);for(const key of ['events','rsvps','comments','media'])equal(unsigned.state[key],[]);
const recovery=observer();equal(await readEvents({gate,...recovery,expectedFamilyId:families[0],request:init=>request(families[0],init)}),true);for(const key of ['events','rsvps','comments','media'])equal(recovery.state[key],snapshots[0][key]);
const changed=observer();equal(await readEvents({gate:new NoticeRequestGate(),...changed,expectedFamilyId:families[0],request:init=>request(families[1],init)}),false);
equal(changed.state.errors,['EVENT_FAMILY_CHANGED']);equal(changed.state.loaded,0);equal(changed.state.family,null);equal(changed.state.canManage,false);equal(changed.state.loading,false);for(const key of ['events','rsvps','comments','media'])equal(changed.state[key],[]);
const page=await request(families[0],{},true,'/events');equal(page.status,200);valid((await page.text()).length>0);
for(let i=0;i<families.length;i++)equal(await read(families[i]),snapshots[i]);
console.log(JSON.stringify({checks,counts:snapshots.map(p=>({family:p.family.id,events:p.events.length,rsvps:p.rsvps.length,comments:p.comments.length,media:p.media.length})),readOnly:true,rowsUnchanged:true,realSeparateUserAcceptance:false,pageStatus:200}));
