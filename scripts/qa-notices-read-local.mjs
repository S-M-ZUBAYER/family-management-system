// Read-only loopback acceptance. No writes, cleanup, SQL or external delivery.
import assert from 'node:assert/strict';
import { readNotices } from '../lib/notice-read.ts';
import { NoticeRequestGate, noticeReadSnapshot } from '../lib/notice-write-outcome.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback origin required.');
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];
let checks=0;
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const valid=value=>{assert.ok(value);checks++;};
async function request(family,init={},signed=true,path='/api/notices'){
 return fetch(new URL(path,origin),{...init,signal:init.signal??AbortSignal.timeout(20000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+family}:{}),...init.headers}});
}
async function read(family){const r=await request(family);equal(r.status,200);const raw=await r.json();valid(noticeReadSnapshot(raw));equal(raw.family.id,family);equal(raw.migrationRequired,false);return raw;}
function observer(){const state={notices:['old data'],canManage:true,loading:false,loaded:0,starts:0,settles:0,errors:[]};return{state,start:()=>{state.notices=[];state.canManage=false;state.loading=true;state.starts++;},loaded:p=>{state.notices=p.notices;state.canManage=p.permissions.canManage;state.loaded++;},setup:()=>{throw Error('Unexpected setup state.');},failed:e=>state.errors.push(e.code),settled:()=>{state.loading=false;state.settles++;}};}
const snapshots=[];
for(const family of families){
 const before=await read(family);snapshots.push(before);const ob=observer();let requests=0;
 equal(await readNotices({gate:new NoticeRequestGate(),...ob,expectedFamilyId:family,request:init=>{requests++;equal(init.cache,'no-store');valid(init.signal);return request(family,init);}}),true);
 equal(requests,1);equal(ob.state.starts,1);equal(ob.state.loaded,1);equal(ob.state.settles,1);equal(ob.state.errors,[]);equal(ob.state.loading,false);equal(ob.state.notices,before.notices);
 for(const row of ob.state.notices)equal(Object.keys(row).sort(),['id','title_bn','title_en','body_bn','body_en','category','priority','status','is_pinned','publish_at','expires_at','created_at','updated_at'].sort());
}
const gate=new NoticeRequestGate(),unsigned=observer();let unsignedRequests=0;
equal(await readNotices({gate,...unsigned,expectedFamilyId:families[0],request:init=>{unsignedRequests++;return request(families[0],init,false);}}),false);
equal(unsignedRequests,1);equal(unsigned.state.errors,['NOTICE_SIGN_IN_REQUIRED']);equal(unsigned.state.notices,[]);equal(unsigned.state.canManage,false);equal(unsigned.state.loading,false);
const recovery=observer();equal(await readNotices({gate,...recovery,expectedFamilyId:families[0],request:init=>request(families[0],init)}),true);equal(recovery.state.notices,snapshots[0].notices);
const changed=observer();equal(await readNotices({gate:new NoticeRequestGate(),...changed,expectedFamilyId:families[0],request:init=>request(families[1],init)}),false);
equal(changed.state.errors,['NOTICE_FAMILY_CHANGED']);equal(changed.state.loaded,0);equal(changed.state.notices,[]);equal(changed.state.canManage,false);equal(changed.state.loading,false);
const page=await request(families[0],{},true,'/notices');equal(page.status,200);valid((await page.text()).length>0);
for(let i=0;i<families.length;i++)equal(await read(families[i]),snapshots[i]);
console.log(JSON.stringify({checks,counts:snapshots.map(p=>({family:p.family.id,notices:p.notices.length})),readOnly:true,rowsUnchanged:true,realSeparateUserAcceptance:false,pageStatus:200}));
