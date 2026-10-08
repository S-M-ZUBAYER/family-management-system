// Opt-in draft/lifecycle QA. Local server may use production Supabase.
import assert from "node:assert/strict";
const args=process.argv.slice(2), option=k=>args[args.indexOf(k)+1];
if(!args.includes("--allow-local-qa-writes")) throw Error("Explicit --allow-local-qa-writes required.");
const origin=new URL(process.env.FMS_QA_ORIGIN??"http://localhost:5173");
if(!["localhost","127.0.0.1","[::1]"].includes(origin.hostname)) throw Error("Loopback only.");
const family="20000000-0000-4000-8000-000000000002", other="10000000-0000-4000-8000-000000000001";
let checks=0;
async function call(path,method="GET",body,expected=200,active=family,signed=true,raw=false){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(20000),headers:{...(signed?{Cookie:`__sites_local_auth=1; fms_active_family=${active}`} :{}),...(body!==undefined?{"Content-Type":"application/json"}:{})},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 const p=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${p.code??p.error??r.status}`);checks++;return p;
}
const before=await call("/api/notices"), otherBefore=await call("/api/notices","GET",undefined,200,other);
assert.equal(before.family.id,family);assert.equal(before.migrationRequired,false);assert.equal(before.permissions.canManage,true);checks+=3;
let prefix=args.includes("--prefix")?option("--prefix"):`QA Notices Lifecycle ${new Date().toISOString().replace(/\D/g,"").slice(0,14)}`;
if(!/^QA Notices Lifecycle \d{14}$/.test(prefix)) throw Error("Exact synthetic prefix required.");
const owns=r=>r.title_bn===prefix||r.title_bn.startsWith(prefix+" ");
let id=args.includes("--notice-id")?option("--notice-id"):null;
if(id){assert.match(id,/^[0-9a-f-]{36}$/i);const row=before.notices.find(r=>r.id===id);assert.ok(row&&owns(row));checks+=2;}
const initialRows=before.notices.filter(r=>r.id!==id);
if(args.includes("--cleanup")){
 if(!id)throw Error("Cleanup needs the exact --notice-id and --prefix.");
 await call(`/api/notices/${id}`,"DELETE");
 const after=await call("/api/notices");assert.deepEqual(after.notices,initialRows);checks++;
 await call(`/api/notices/${id}`,"DELETE",undefined,404);
 await call(`/api/notices/${id}`,"PATCH",{action:"pin"},404);
 const logs=(await call("/api/admin")).auditLogs;assert.ok(logs.some(r=>r.entity_id===id&&r.action==="family_notice_deleted"));checks++;
 assert.deepEqual((await call("/api/notices","GET",undefined,200,other)).notices,otherBefore.notices);checks++;
 console.log(JSON.stringify({prefix,id,checks,deleted:1,unrelatedNoticesUnchanged:true}));process.exit(0);
}
const data={titleBn:prefix,titleEn:prefix,bodyBn:"Synthetic lifecycle QA only; not a genuine announcement.",bodyEn:"English search-only fixture text.",status:"draft",isPinned:false};
await call("/api/notices","GET",undefined,401,family,false);
await call("/api/notices","POST",data,401,family,false);
for(const body of [null,[],true,"bad"]) {const p=await call("/api/notices","POST",body,400);assert.equal(p.code,"NOTICE_INVALID_BODY");checks++;}
assert.equal((await call("/api/notices","POST","{",400,family,true,true)).code,"NOTICE_INVALID_BODY");checks++;
for(const [key,bad] of [["category",true],["category","bad"],["priority",[]],["status",null],["status","archived"],["isPinned","true"],["titleBn","ab"],["titleBn","a".repeat(181)],["bodyBn","abcd"],["bodyEn",true]]) await call("/api/notices","POST",{...data,[key]:bad},400);
for(const key of ["publishAt","expiresAt"]) for(const bad of [true,[],"garbage","2026-02-30T12:00Z","2026-10-08T12:00"]) {const p=await call("/api/notices","POST",{...data,[key]:bad},400);assert.equal(p.code,"NOTICE_INVALID_DATE");checks++;}
const badSchedule=await call("/api/notices","POST",{...data,status:"published",expiresAt:"2020-01-01T00:00Z"},400);assert.equal(badSchedule.code,"NOTICE_INVALID_SCHEDULE");checks++;
if(!id){const p=await call("/api/notices","POST",data,201);id=p.notice.id;assert.equal(p.notice.status,"draft");checks++;}
console.log(JSON.stringify({prefix,id,warning:"Only this synthetic notice is mutated; no external notification or provider action."}));
const path=`/api/notices/${id}`;
for(const method of ["PATCH","DELETE"]) await call(path,method,method==="PATCH"?{action:"pin"}:undefined,401,family,false);
for(const method of ["PATCH","DELETE"]) {const p=await call("/api/notices/not-a-uuid",method,method==="PATCH"?{action:"pin"}:undefined,400);assert.equal(p.code,"NOTICE_INVALID_ID");checks++;}
for(const body of [null,[],true]) await call(path,"PATCH",body,400);
await call(path,"PATCH","{",400,family,true,true);
for(const action of ["constructor","__proto__","bogus",null]) await call(path,"PATCH",{action},400);
for(const data of [null,[],true]) await call(path,"PATCH",{action:"edit",data},400);
for(const action of ["publish","draft","archive","pin","unpin","edit"]) await call(path,"PATCH",{action,data},404,other);
await call(path,"DELETE",undefined,404,other);
for(const [action,status,pin] of [["pin","draft",true],["unpin","draft",false],["publish","published",false],["draft","draft",false],["publish","published",false],["archive","archived",false]]){
 const p=await call(path,"PATCH",{action});assert.equal(p.notice.status,status);assert.equal(p.notice.is_pinned,pin);checks+=2;
 const read=(await call("/api/notices")).notices.find(r=>r.id===id);assert.equal(read.status,status);assert.equal(read.is_pinned,pin);checks+=2;
}
let p=await call(path,"PATCH",{action:"edit",data:{...data,titleBn:prefix+" edited",status:"archived",publishAt:"2024-02-29T16:30:00+06:00",expiresAt:"2024-03-01T16:30:00+06:00"}});
assert.equal(p.notice.status,"archived");assert.equal(new Date(p.notice.publish_at).toISOString(),"2024-02-29T10:30:00.000Z");checks+=2;
p=await call(path,"PATCH",{action:"publish"},409);assert.equal(p.code,"NOTICE_EXPIRED");checks++;
p=await call(path,"PATCH",{action:"edit",data:{...data,titleBn:prefix+" edited",status:"published",publishAt:"2099-01-01T12:00:00+06:00",expiresAt:"2099-01-02T12:00:00+06:00"}});assert.equal(p.notice.status,"published");checks++;
p=await call(path,"PATCH",{action:"edit",data:{...data,titleBn:prefix+" edited",publishAt:null,expiresAt:null}});assert.equal(p.notice.status,"draft");checks++;
const after=await call("/api/notices");assert.deepEqual(after.notices.filter(r=>r.id!==id),initialRows);checks++;
assert.deepEqual((await call("/api/notices","GET",undefined,200,other)).notices,otherBefore.notices);checks++;
const logs=(await call("/api/admin")).auditLogs;
for(const action of ["family_notice_created","family_notice_pin","family_notice_unpin","family_notice_publish","family_notice_draft","family_notice_archive","family_notice_updated"]){assert.ok(logs.some(r=>r.entity_id===id&&r.action===action));checks++;}
console.log(JSON.stringify({prefix,id,checks,finalStatus:"draft",unrelatedNoticesUnchanged:true,cleanupPending:true}));
