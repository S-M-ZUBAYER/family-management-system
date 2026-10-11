// Explicit, narrowly scoped mock-owner QA; loopback may use production Supabase.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const args=process.argv.slice(2),option=key=>args[args.indexOf(key)+1];
if(!args.includes("--allow-local-qa-writes"))throw Error("Explicit --allow-local-qa-writes required.");
const origin=new URL(process.env.FMS_QA_ORIGIN??"http://localhost:5173");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(origin.hostname));
const family="20000000-0000-4000-8000-000000000002",other="10000000-0000-4000-8000-000000000001";
const prefix=args.includes("--prefix")?option("--prefix"):`QA Magazine Cover ${new Date().toISOString().replace(/\D/g,"").slice(0,14)}`;
assert.match(prefix,/^QA Magazine Cover \d{14}$/);
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=","base64");
const cookie=active=>`__sites_local_auth=1; fms_active_family=${active}`;
async function json(path,method="GET",body,status=200,active=family,signed=true){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(30000),headers:{...(signed?{Cookie:cookie(active)}:{}),...(body!==undefined?{"Content-Type":"application/json"}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const p=await r.json();eq(r.status,status);return p;
}
const read=active=>json("/api/magazine","GET",undefined,200,active);
const before=await read(family),otherBefore=await read(other);
for(const [p,id] of [[before,family],[otherBefore,other]]){eq(p.family.id,id);eq(p.permissions.canManage,true);eq(p.migrationRequired,false);}
const arrays=p=>({articles:p.articles,comments:p.comments,media:p.media});
if(args.includes("--resume")) {
 const id=option("--article-id"),row=before.articles.find(a=>a.id===id);
 assert.ok(row&&row.is_mine&&row.title===prefix&&row.status==="draft");checks++;
 eq(before.media.filter(m=>m.article_id===id).length,0);eq(before.comments.filter(c=>c.article_id===id).length,0);eq(row.reaction_count,0);
 before.articles=before.articles.filter(a=>a.id!==id);
}
async function download(id,status=200,active=family,signed=true){
 const r=await fetch(new URL(`/api/magazine-media/${id}`,origin),{signal:AbortSignal.timeout(30000),headers:signed?{Cookie:cookie(active)}:{}});eq(r.status,status);
 if(status===200){eq(r.headers.get("Content-Type"),"image/png");eq(new Uint8Array(await r.arrayBuffer()),new Uint8Array(png));}else await r.arrayBuffer();
}
if(args.includes("--cleanup")){
 const articleId=option("--article-id"),mediaId=option("--media-id");assert.match(articleId,/^[0-9a-f-]{36}$/i);assert.match(mediaId,/^[0-9a-f-]{36}$/i);
 const row=before.articles.find(a=>a.id===articleId);assert.ok(row&&row.is_mine&&[prefix,prefix+" edited"].includes(row.title));eq(row.status,"draft");
 eq(before.articles.filter(a=>a.title.startsWith(prefix)).length,1);
 const beforeLogs=(await json("/api/admin")).auditLogs;eq(beforeLogs.filter(l=>l.entity_id===articleId&&l.action==="magazine_cover_uploaded").length,2);
 const attached=before.media.filter(m=>m.article_id===articleId);eq(attached.length,1);eq(attached[0].id,mediaId);eq(attached[0].file_name,prefix+" second.png");
 eq(before.comments.filter(c=>c.article_id===articleId).length,0);eq(row.reaction_count,0);
 await json("/api/magazine/records","DELETE",{kind:"article",recordId:articleId});
 const after=await read(family);for(const key of ["articles","comments","media"])eq(after[key],before[key].filter(r=>key==="articles"?r.id!==articleId:r.article_id!==articleId));
 eq(arrays(await read(other)),arrays(otherBefore));await download(mediaId,404);
 await json("/api/magazine/records","DELETE",{kind:"article",recordId:articleId},404);
 const logs=(await json("/api/admin")).auditLogs;assert.ok(logs.some(l=>l.entity_id===articleId&&l.action==="magazine_article_deleted"));checks++;
 console.log(JSON.stringify({prefix,articleId,mediaId,checks,deletedArticles:1,deletedCurrentCover:1,unrelatedRecordsUnchanged:true}));process.exit(0);
}
async function upload(articleId,bytes=png,name=prefix+" first.png",type="image/png",status=201,active=family,signed=true){
 const form=new FormData();form.set("articleId",articleId);if(bytes!==null)form.set("file",new File([bytes],name,{type}));
 const r=await fetch(new URL("/api/magazine/upload",origin),{method:"POST",body:form,signal:AbortSignal.timeout(30000),headers:signed?{Cookie:cookie(active)}:{}});
 const raw=await r.text();let p;try{p=JSON.parse(raw);}catch{assert.equal(r.status,413);checks++;p={code:"MAGAZINE_INVALID_COVER",proxyRejected:true};}
 if(Array.isArray(status)){assert.ok(status.includes(r.status));checks++;}else eq(r.status,status);return p;
}
const missing=randomUUID();await upload(missing,png,undefined,undefined,401,family,false);
 await json("/api/magazine/upload","POST",{},400);
for(const id of ["bad","", "constructor"])eq((await upload(id,png,undefined,undefined,400)).code,"MAGAZINE_INVALID_ID");
const data={title:prefix,content:"Clearly labeled synthetic draft for Magazine cover QA only.",summary:"Synthetic cover QA",category:"story",visibility:"family",tags:"QA, cover",saveDraft:"true",publishNow:"false"};
const articleId=args.includes("--resume")?option("--article-id"):(await json("/api/magazine/records","POST",{action:"create_article",data},201)).id;assert.match(articleId,/^[0-9a-f-]{36}$/i);checks++;
console.log(JSON.stringify({prefix,articleId,phase:"fixture-created"}));
for(const [bytes,name,type] of [[null,"missing.png","image/png"],[Buffer.alloc(0),"empty.png","image/png"],[Buffer.from("not a PNG"),"fake.png","image/png"],[png,"wrong.exe","image/png"],[png,"a".repeat(221),"image/png"],[Buffer.from("<svg></svg>"),"x.svg","image/svg+xml"]])eq((await upload(articleId,bytes,name,type,400)).code,"MAGAZINE_INVALID_COVER");
eq((await upload(articleId,Buffer.alloc(10*1024*1024+1),"large.png","image/png",[400,413])).code,"MAGAZINE_INVALID_COVER");
await upload(missing,png,undefined,undefined,404);await upload(articleId,png,undefined,undefined,404,other);
eq(arrays(await read(other)),arrays(otherBefore));eq((await read(family)).media,before.media);
const first=await upload(articleId);eq(first.auditPending,false);eq(first.cleanupPending,false);
await download(first.id);await download(first.id,401,family,false);await download(first.id,404,other);
let current=await read(family),cover=current.media.filter(m=>m.article_id===articleId);eq(cover.length,1);eq(cover[0].id,first.id);eq(cover[0].file_name,prefix+" first.png");eq(cover[0].file_size,png.length);
await json("/api/magazine/records","PATCH",{articleId,data:{...data,title:prefix+" edited"}});
current=await read(family);eq(current.articles.find(a=>a.id===articleId).title,prefix+" edited");eq(current.articles.find(a=>a.id===articleId).status,"draft");
const second=await upload(articleId,png,prefix+" second.png");eq(second.auditPending,false);eq(second.cleanupPending,false);assert.notEqual(second.id,first.id);checks++;
await download(second.id);await download(first.id,404);
current=await read(family);cover=current.media.filter(m=>m.article_id===articleId);eq(cover.length,1);eq(cover[0].id,second.id);eq(cover[0].file_name,prefix+" second.png");
for(const key of ["articles","comments","media"])eq(current[key].filter(r=>key==="articles"?r.id!==articleId:r.article_id!==articleId),before[key]);
eq(arrays(await read(other)),arrays(otherBefore));
const logs=(await json("/api/admin")).auditLogs;eq(logs.filter(l=>l.entity_id===articleId&&l.action==="magazine_cover_uploaded").length,2);
console.log(JSON.stringify({prefix,articleId,firstMediaId:first.id,mediaId:second.id,checks,unrelatedRecordsUnchanged:true,cleanupRequired:true}));
