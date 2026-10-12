// Opt-in core-event lifecycle only. The loopback server may use production DB.
import assert from 'node:assert/strict';
import {eventMutationAcknowledged,eventReadSnapshot} from '../lib/event-write-outcome.ts';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(!args.includes('--allow-local-qa-writes'))throw Error('Explicit --allow-local-qa-writes required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.username||origin.password)throw Error('Credential-free loopback origin required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001';
let checks=0;
const prefix=args.includes('--prefix')?option('--prefix'):'QA Event Lifecycle '+new Date().toISOString().replace(/\D/g,'').slice(0,14);
if(!/^QA Event Lifecycle \d{14}$/.test(prefix))throw Error('Exact synthetic prefix required.');
async function call(path,method='GET',body,expected=200,active=family,signed=true,raw=false){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(20000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 const p=await r.json();
 if(method==='POST'&&path==='/api/events'&&p.success===true&&p.id)console.log(JSON.stringify({prefix,id:p.id,notice:'Only this new synthetic event is in scope; no child writes or external delivery.'}));
 assert.equal(r.status,expected,method+' '+path+': '+(p.code??p.error??r.status));checks++;
 if(expected>=200&&expected<300&&method!=='GET'){assert.equal(eventMutationAcknowledged(method,path.split('/')[3],body??{},r.status,p),true);checks++;}
 if(method==='GET'&&path==='/api/events'&&expected===200){assert.ok(eventReadSnapshot(p,active));checks++;}
 return p;
}
const before=await call('/api/events'),otherBefore=await call('/api/events','GET',undefined,200,other);
assert.equal(before.family.id,family);assert.equal(before.permissions.canManage,true);assert.equal(before.migrationRequired,false);checks+=3;
let id=args.includes('--event-id')?option('--event-id'):null;
if(id){const row=before.events.find(e=>e.id===id);assert.ok(row&&(row.title_bn===prefix||row.title_bn.startsWith(prefix+' ')));checks++;}
const withoutId=p=>({...p,events:p.events.filter(e=>e.id!==id),rsvps:p.rsvps.filter(e=>e.event_id!==id),comments:p.comments.filter(e=>e.event_id!==id),media:p.media.filter(e=>e.event_id!==id)});
const unchanged=withoutId(before);
if(args.includes('--cleanup')){
 if(!id)throw Error('Cleanup needs exact --event-id and --prefix.');
 assert.equal(before.events.find(e=>e.id===id).status,'draft');checks++;
 for(const key of ['rsvps','comments','media']){assert.equal(before[key].some(e=>e.event_id===id),false);checks++;}
 await call('/api/events/'+id,'DELETE');assert.deepEqual(await call('/api/events'),unchanged);checks++;
 await call('/api/events/'+id,'DELETE',undefined,404);await call('/api/events/'+id,'PATCH',{action:'publish'},404);
 assert.deepEqual(await call('/api/events','GET',undefined,200,other),otherBefore);checks++;
 assert.ok((await call('/api/admin')).auditLogs.some(e=>e.entity_id===id&&e.action==='family_event_deleted'));checks++;
 console.log(JSON.stringify({prefix,id,checks,deleted:1,unrelatedDataUnchanged:true}));process.exit(0);
}
const data={titleBn:prefix,titleEn:prefix,descriptionBn:'Synthetic lifecycle QA only; not a genuine family announcement.',descriptionEn:'English synthetic details.',venue:'QA Test Location',eventType:'meeting',startAt:'2099-01-01T12:00:00+06:00',endAt:'2099-01-01T14:00:00+06:00',estimatedCostPerPerson:'1.25',totalBudget:'10.50',capacity:'12',status:'draft'};
await call('/api/events','GET',undefined,401,family,false);await call('/api/events','POST',data,401,family,false);
for(const body of [null,[],true,'bad']){assert.equal((await call('/api/events','POST',body,400)).code,'EVENT_INVALID_BODY');checks++;}
assert.equal((await call('/api/events','POST','{',400,family,true,true)).code,'EVENT_INVALID_BODY');checks++;
for(const [key,bad,code]of [['titleBn','ab','EVENT_INVALID_TEXT'],['titleBn','x'.repeat(181),'EVENT_INVALID_TEXT'],['descriptionEn',true,'EVENT_INVALID_TEXT'],['eventType',[],'EVENT_INVALID_OPTION'],['status','completed','EVENT_INVALID_OPTION'],['startAt','2026-02-30T12:00Z','EVENT_INVALID_DATE'],['startAt','2099-01-01T12:00','EVENT_INVALID_DATE'],['endAt',true,'EVENT_INVALID_DATE'],['endAt','2020-01-01T00:00Z','EVENT_INVALID_SCHEDULE'],['estimatedCostPerPerson',true,'EVENT_INVALID_MONEY'],['totalBudget','1.001','EVENT_INVALID_MONEY'],['totalBudget','1000000000000','EVENT_INVALID_MONEY'],['capacity','1.5','EVENT_INVALID_CAPACITY'],['capacity',true,'EVENT_INVALID_CAPACITY']]){assert.equal((await call('/api/events','POST',{...data,[key]:bad},400)).code,code);checks++;}
if(!id){const p=await call('/api/events','POST',data,201);id=p.id;assert.equal(p.event.status,'draft');assert.equal(Number(p.event.total_budget),10.5);checks+=2;}
const path='/api/events/'+id;
for(const method of ['PATCH','DELETE']){await call(path,method,method==='PATCH'?{action:'publish'}:undefined,401,family,false);assert.equal((await call('/api/events/not-a-uuid',method,method==='PATCH'?{action:'publish'}:undefined,400)).code,'EVENT_INVALID_ID');checks++;}
for(const body of [null,[],true])await call(path,'PATCH',body,400);await call(path,'PATCH','{',400,family,true,true);
for(const action of ['constructor','__proto__','bogus',null])assert.equal((await call(path,'PATCH',{action},400)).code,'EVENT_INVALID_ACTION');checks+=4;
for(const action of ['edit','publish','draft','close','complete','cancel'])await call(path,'PATCH',{action,data},404,other);await call(path,'DELETE',undefined,404,other);
for(const [action,status]of [['publish','published'],['close','registration_closed'],['complete','completed'],['cancel','cancelled'],['draft','draft']]){
 const p=await call(path,'PATCH',{action});assert.equal(p.event.status,status);checks++;
 assert.equal((await call('/api/events')).events.find(e=>e.id===id).status,status);checks++;
}
let p=await call(path,'PATCH',{action:'edit',data:{...data,titleBn:prefix+' edited',status:'completed',startAt:'2024-02-29T12:30:00+06:00',endAt:'2024-02-29T13:30:00+06:00'}});
assert.equal(p.event.status,'completed');assert.equal(new Date(p.event.start_at).toISOString(),'2024-02-29T06:30:00.000Z');checks+=2;
for(const [key,value,code]of [['capacity','1.2','EVENT_INVALID_CAPACITY'],['totalBudget','1.001','EVENT_INVALID_MONEY'],['status',null,'EVENT_INVALID_OPTION']]){assert.equal((await call(path,'PATCH',{action:'edit',data:{...data,[key]:value}},400)).code,code);checks++;}
await call(path,'PATCH',{action:'edit',data},200);const after=await call('/api/events');assert.equal(after.events.find(e=>e.id===id).status,'draft');checks++;
assert.deepEqual(withoutId(after),unchanged);checks++;assert.deepEqual(await call('/api/events','GET',undefined,200,other),otherBefore);checks++;
const logs=(await call('/api/admin')).auditLogs;for(const action of ['family_event_created','family_event_updated','family_event_publish','family_event_close','family_event_complete','family_event_cancel','family_event_draft']){assert.ok(logs.some(e=>e.entity_id===id&&e.action===action));checks++;}
console.log(JSON.stringify({prefix,id,checks,finalStatus:'draft',unrelatedDataUnchanged:true,cleanupPending:true}));
