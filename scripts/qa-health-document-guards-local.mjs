// Rejection/read-only QA. No valid upload and no deletion of an existing record.
import assert from 'node:assert/strict';
import {healthReadSnapshot} from '../lib/health-read.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.username||origin.password||!['http:','https:'].includes(origin.protocol))throw Error('Credential-free loopback required.');
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kQ8sAAAAASUVORK5CYII=','base64');
async function snapshot(family){const r=await fetch(new URL('/api/health',origin),{headers:{Cookie:'__sites_local_auth=1; fms_active_family='+family},signal:AbortSignal.timeout(25000)});eq(r.status,200);const p=await r.json();ok(healthReadSnapshot(p));return p;}
function form(scope,patch={}){const f=new FormData();f.set('file',new File([png],'QA-guard-only.png',{type:'image/png'}));f.set('title','QA guard (must never save)');f.set('category','other');f.set('documentDate','2026-10-14');f.set('expectedFamilyId',scope.familyId);f.set('expectedActorId',scope.actorId);for(const[k,v]of Object.entries(patch))f.set(k,v);return f;}
async function denied(family,path,method,body,status,code,signed=true){const multipart=body instanceof FormData;const r=await fetch(new URL(path,origin),{method,headers:{...(multipart?{}:{'Content-Type':'application/json'}),...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+family}:{})},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});eq(r.status,status);const p=await r.json();if(code)eq(p.code,code);eq(p.success===true,false);eq(p.outcomeUnknown===true,false);}
const before=[];for(const family of families)before.push(await snapshot(family));
const fakeId=crypto.randomUUID();for(const p of before)eq(p.documents.some(d=>d.id===fakeId),false);
for(let i=0;i<families.length;i++){
 const family=families[i],scope=before[i].scope;
 for(const patch of [{expectedActorId:'not-this-owner'},{expectedFamilyId:families[1-i]}])await denied(family,'/api/health/upload','POST',form(scope,patch),409,'HEALTH_DOC_CONTEXT');
 for(const patch of [{title:'x'.repeat(181)},{category:'invalid'},{documentDate:'2026-02-30'}])await denied(family,'/api/health/upload','POST',form(scope,patch),400,'HEALTH_DOC_INPUT');
 await denied(family,'/api/health/upload','POST',form(scope,{file:new File(['not PNG'],'QA-invalid.png',{type:'image/png'})}),400,'HEALTH_DOC_FILE');
 const duplicate=form(scope);duplicate.append('title','duplicate');await denied(family,'/api/health/upload','POST',duplicate,400,'HEALTH_DOC_INPUT');
 await denied(family,'/api/health/upload','POST',form(scope,{expectedActorId:'not-this-owner'}),401,null,false);
 const synthetic={id:fakeId,file_name:'QA-guard-only.png',mime_type:'image/png',file_size:png.length,category:'other',title:'Must never exist',document_date:null,notes:null,created_at:'2026-10-14T09:00:00Z'},path='/api/health-document/'+fakeId;
 await denied(family,path,'DELETE',{expectedScope:{...scope,actorId:'not-this-owner'},expectedDocument:synthetic},409,'HEALTH_DOC_CONTEXT');
 await denied(family,path,'DELETE',{expectedScope:{...scope,familyId:families[1-i]},expectedDocument:synthetic},409,'HEALTH_DOC_CONTEXT');
 await denied(family,path,'DELETE',{expectedScope:scope,expectedDocument:{...synthetic,title:'x'.repeat(181)}},400,'HEALTH_DOC_INPUT');
 await denied(family,path,'DELETE',{expectedScope:scope,expectedDocument:synthetic},404,'HEALTH_DOC_CHANGED');
 await denied(family,path,'DELETE',null,400,'HEALTH_DOC_INPUT');
 await denied(family,path,'DELETE',{expectedScope:scope,expectedDocument:synthetic},401,null,false);
 for(const [target,status]of [[path,404],['/api/health-document/not-a-uuid',400]]){const r=await fetch(new URL(target,origin),{headers:{Cookie:'__sites_local_auth=1; fms_active_family='+family},signal:AbortSignal.timeout(25000)});eq(r.status,status);}
}
for(let i=0;i<families.length;i++)eq(await snapshot(families[i]),before[i]);
console.log(JSON.stringify({checks,families:2,privateSnapshotsUnchanged:true,validUploadsRequested:0,existingRecordsDeleted:0,storageOrAuditOrSqlChanges:0,actualBrowserOrRealUserOrPositiveStorageAcceptance:false}));
