// Explicit opt-in local mock-owner QA. Server may use production Supabase.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(!args.includes("--allow-local-qa-writes"))throw Error("Explicit --allow-local-qa-writes required.");
const origin=new URL(process.env.FMS_QA_ORIGIN??"http://localhost:5173");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(origin.hostname),"Loopback only.");
const family="20000000-0000-4000-8000-000000000002",other="10000000-0000-4000-8000-000000000001",endpoint="/api/magazine/records";
let checks=0;
async function call(path,method="GET",body,status=200,active=family,signed=true,raw=false){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(25000),headers:{...(signed?{Cookie:`__sites_local_auth=1; fms_active_family=${active}`} :{}),...(body!==undefined?{"Content-Type":"application/json"}:{})},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 const p=await r.json();assert.equal(r.status,status,`${method} ${path}: ${p.code??p.error??r.status}`);checks++;return p;
}
const read=()=>call("/api/magazine"),before=await read(),otherBefore=await call("/api/magazine","GET",undefined,200,other);
for(const [snapshot,id]of [[before,family],[otherBefore,other]]) {assert.equal(snapshot.family.id,id);assert.equal(snapshot.permissions.canManage,true);assert.equal(snapshot.migrationRequired,false);checks+=3;}
const prefix=args.includes("--prefix")?option("--prefix"):`QA Magazine Lifecycle ${new Date().toISOString().replace(/\D/g,"").slice(0,14)}`;
assert.match(prefix,/^QA Magazine Lifecycle \d{14}$/);
if(args.includes("--cleanup")) {
 const id=option("--article-id");assert.ok(args.includes("--article-id"));assert.match(id,/^[0-9a-f-]{36}$/i);
 const row=before.articles.find(r=>r.id===id);assert.ok(row&&[prefix,prefix+" edited"].includes(row.title));assert.notEqual(row.status,"published");checks+=2;
 assert.equal(before.media.filter(r=>r.article_id===id).length,0,"This harness only removes its no-media fixture.");checks++;
 await call(endpoint,"DELETE",{kind:"article",recordId:id});
 const after=await read();
 for(const key of ["articles","comments","media"]) {assert.deepEqual(after[key],before[key].filter(r=>key==="articles"?r.id!==id:r.article_id!==id));checks++;}
 await call(endpoint,"DELETE",{kind:"article",recordId:id},404);
 await call(endpoint,"PATCH",{articleId:id,data:{title:prefix,content:"Synthetic cleanup missing-record test."}},404);
 const logs=(await call("/api/admin")).auditLogs;assert.ok(logs.some(r=>r.entity_id===id&&r.action==="magazine_article_deleted"));checks++;
 const otherAfter=await call("/api/magazine","GET",undefined,200,other);for(const key of ["articles","comments","media"]) {assert.deepEqual(otherAfter[key],otherBefore[key]);checks++;}
 console.log(JSON.stringify({prefix,id,checks,deletedArticles:1,unrelatedRecordsUnchanged:true}));process.exit(0);
}
const data={title:prefix,content:"Clearly labeled synthetic article for Magazine QA only.",summary:"Synthetic summary",category:"story",visibility:"family",tags:"QA, lifecycle, QA",saveDraft:"true",publishNow:"false"};
await call("/api/magazine","GET",undefined,401,family,false);
for(const method of ["POST","PATCH","DELETE"])await call(endpoint,method,{},401,family,false);
for(const method of ["POST","PATCH","DELETE"])for(const body of [null,[],true,"bad"])await call(endpoint,method,body,400);
for(const method of ["POST","PATCH","DELETE"]) {assert.equal((await call(endpoint,method,"{",400,family,true,true)).code,"MAGAZINE_INVALID_BODY");checks++;}
for(const action of [null,"bad","constructor","__proto__"])await call(endpoint,"POST",{action,data},400);
for(const value of [null,[],true])await call(endpoint,"POST",{action:"create_article",data:value},400);
for(const patch of [{title:""},{title:1},{title:"a".repeat(181)},{content:"short"},{content:"a".repeat(30001)},{summary:[]},{summary:"a".repeat(501)},{category:"bad"},{visibility:null},{tags:[]},{tags:"a".repeat(61)},{tags:Array.from({length:13},(_,i)=>String(i)).join(",")},{publishNow:"yes"},{saveDraft:1},{saveDraft:true,publishNow:true}])await call(endpoint,"POST",{action:"create_article",data:{...data,...patch}},400);
for(const kind of ["bad","constructor",null])await call(endpoint,"DELETE",{kind,recordId:randomUUID()},400);
const missing=randomUUID();await call(endpoint,"POST",{action:"moderate_comment",data:{commentId:missing,status:"hidden"}},404);
assert.ok(!(await call("/api/admin")).auditLogs.some(r=>r.entity_id===missing));checks++;
const created=await call(endpoint,"POST",{action:"create_article",data},201),id=created.id;assert.equal(created.status,"draft");checks++;
console.log(JSON.stringify({prefix,id,warning:"Only this new no-media article and its QA comments/reaction are modified."}));
const article=async()=>{const r=(await read()).articles.find(r=>r.id===id);assert.ok(r);checks++;return r;};
assert.deepEqual((await article()).tags,["QA","lifecycle"]);checks++;
await call(endpoint,"PATCH",{articleId:id,data:{...data,title:prefix+" edited",category:"history",visibility:"admins"}});
let saved=await article();assert.equal(saved.title,prefix+" edited");assert.equal(saved.status,"draft");assert.equal(saved.visibility,"admins");checks+=3;
for(const patch of [{category:"bad"},{title:true},{content:"a".repeat(30001)},{tags:null}])await call(endpoint,"PATCH",{articleId:id,data:{...data,...patch}},400);
await call(endpoint,"PATCH",{articleId:id,data:null},400);
for(const status of [undefined,null,"bad"])await call(endpoint,"POST",{action:"set_status",data:{articleId:id,status}},400);
await call(endpoint,"POST",{action:"set_status",data:{articleId:id,status:"draft",featured:true}},400);
await call(endpoint,"POST",{action:"toggle_like",data:{articleId:id}},404);
await call(endpoint,"POST",{action:"add_comment",data:{articleId:id,body:"QA unpublished comment"}},404);
await call(endpoint,"PATCH",{articleId:id,data:{...data,title:prefix+" edited"}});
await call(endpoint,"POST",{action:"set_status",data:{articleId:id,status:"published",featured:true}});
saved=await article();assert.equal(saved.status,"published");assert.equal(saved.featured,true);assert.ok(saved.published_at);checks+=3;
await call(endpoint,"DELETE",{kind:"article",recordId:id},409);
const liked=await call(endpoint,"POST",{action:"toggle_like",data:{articleId:id}});assert.equal(liked.reacted,true);assert.equal((await article()).reaction_count,1);checks+=2;
const unliked=await call(endpoint,"POST",{action:"toggle_like",data:{articleId:id}});assert.equal(unliked.reacted,false);assert.equal((await article()).reaction_count,0);checks+=2;
for(const body of ["",true,"a".repeat(2001)])await call(endpoint,"POST",{action:"add_comment",data:{articleId:id,body}},400);
const comment=await call(endpoint,"POST",{action:"add_comment",data:{articleId:id,body:prefix+" QA comment"}},201);
console.log(JSON.stringify({commentId:comment.id}));
for(const status of ["hidden","visible"]) {await call(endpoint,"POST",{action:"moderate_comment",data:{commentId:comment.id,status}});assert.equal((await read()).comments.find(r=>r.id===comment.id)?.status,status);checks++;}
await call(endpoint,"POST",{action:"moderate_comment",data:{commentId:comment.id,status:"bad"}},400);
for(const action of ["set_status","toggle_like","add_comment"])await call(endpoint,"POST",{action,data:{articleId:id,status:"published",body:"QA cross-family"}},404,other);
await call(endpoint,"POST",{action:"moderate_comment",data:{commentId:comment.id,status:"hidden"}},404,other);
await call(endpoint,"PATCH",{articleId:id,data},404,other);
for(const [kind,recordId]of [["article",id],["comment",comment.id]])await call(endpoint,"DELETE",{kind,recordId},404,other);
await call(endpoint,"DELETE",{kind:"comment",recordId:comment.id});assert.ok(!(await read()).comments.some(r=>r.id===comment.id));checks++;
await call(endpoint,"DELETE",{kind:"comment",recordId:comment.id},404);
await call(endpoint,"POST",{action:"moderate_comment",data:{commentId:comment.id,status:"hidden"}},404);
for(const status of ["pending","draft","archived"]) {await call(endpoint,"POST",{action:"set_status",data:{articleId:id,status}});saved=await article();assert.equal(saved.status,status);assert.equal(saved.featured,false);checks+=2;}
await call(endpoint,"PATCH",{articleId:id,data:{...data,title:prefix+" edited",summary:"QA archived edit retained"}});assert.equal((await article()).status,"archived");checks++;
const after=await read();for(const key of ["articles","comments","media"]) {assert.deepEqual(after[key].filter(r=>key==="articles"?r.id!==id:r.article_id!==id),before[key]);checks++;}
const otherAfter=await call("/api/magazine","GET",undefined,200,other);for(const key of ["articles","comments","media"]) {assert.deepEqual(otherAfter[key],otherBefore[key]);checks++;}
const logs=(await call("/api/admin")).auditLogs;
for(const action of ["magazine_article_created","magazine_article_updated","magazine_article_published","magazine_article_pending","magazine_article_draft","magazine_article_archived"]) {assert.ok(logs.some(r=>r.entity_id===id&&r.action===action));checks++;}
for(const action of ["magazine_comment_added","magazine_comment_hidden","magazine_comment_visible","magazine_comment_deleted"]) {assert.ok(logs.some(r=>r.entity_id===comment.id&&r.action===action));checks++;}
console.log(JSON.stringify({prefix,id,checks,finalStatus:"archived",unrelatedRecordsUnchanged:true,cleanupPending:true}));
