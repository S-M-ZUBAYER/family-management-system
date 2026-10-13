// Opt-in: one new synthetic parent/PNG only, no existing rows/files/SQL changes.
import assert from 'node:assert/strict';
import {eventSafeSnapshot} from '../lib/event-read.ts';
import {eventMediaExpected,eventMediaAcknowledged} from '../lib/event-media-workflow.ts';
import {eventMediaDeleteAllowed} from '../lib/event-media-access.ts';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(!args.includes('--allow-local-qa-writes'))throw Error('Explicit --allow-local-qa-writes required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001';
const prefix=args.includes('--prefix')?option('--prefix'):'QA Event Media Ownership '+new Date().toISOString().replace(/\D/g,'').slice(0,14);
if(!/^QA Event Media Ownership \d{14}$/.test(prefix))throw Error('Exact synthetic prefix required.');
const description='Synthetic media-ownership acceptance only; not a genuine announcement.',venue='QA Ownership Location';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=','base64');
let checks=0,parentId,mediaId;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},valid=a=>{assert.ok(a);checks++;};
async function call(path,method='GET',body,expected=200,active=family,signed=true){
 const form=body instanceof FormData;
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(25000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{}),...(body!==undefined&&!form?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:form?body:JSON.stringify(body)}:{})});
 const p=await r.json();if(method==='POST'&&r.ok&&p.id)console.log(JSON.stringify({prefix,path,id:p.id,status:r.status}));equal(r.status,expected);
 if(method==='GET'&&path==='/api/events'&&r.ok){valid(eventSafeSnapshot(p));equal(p.family.id,active);}
 if((path.endsWith('/media')||path.startsWith('/api/event-media/'))&&r.ok)equal(eventMediaAcknowledged(eventMediaExpected(path,method,body),r.status,p),true);
 return p;
}
async function readFile(id,expected=200,active=family,signed=true){
 const r=await fetch(new URL('/api/event-media/'+id,origin),{headers:signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{},signal:AbortSignal.timeout(25000)});equal(r.status,expected);
 if(expected===200){equal(r.headers.get('Cache-Control'),'private, no-store');equal(r.headers.get('X-Content-Type-Options'),'nosniff');valid(r.headers.get('ETag'));equal(Buffer.from(await r.arrayBuffer()),png);}
}
const before=await call('/api/events'),otherBefore=await call('/api/events','GET',undefined,200,other);equal(before.permissions.canManage,true);equal(before.migrationRequired,false);
const filtered=p=>({...p,events:p.events.filter(e=>e.id!==parentId),rsvps:p.rsvps.filter(e=>e.event_id!==parentId),comments:p.comments.filter(e=>e.event_id!==parentId),media:p.media.filter(e=>e.event_id!==parentId)});
if(args.includes('--cleanup')){
 parentId=option('--event-id');mediaId=option('--media-id');const parent=before.events.find(e=>e.id===parentId);valid(parent);equal(parent.title_bn,prefix);equal(parent.description_bn,description);equal(parent.venue,venue);
 for(const key of ['rsvps','comments'])equal(before[key].filter(e=>e.event_id===parentId).length,0);
 const rows=before.media.filter(e=>e.event_id===parentId);valid(rows.length<=1);if(rows.length){equal(rows[0].id,mediaId);equal(rows[0].file_name,prefix+'.png');equal(rows[0].caption,prefix);equal(rows[0].file_size,png.length);equal(rows[0].mime_type,'image/png');equal(rows[0].is_current_user,true);}
 const preserved=filtered(before);if(parent.status!=='draft')await call('/api/events/'+parentId,'PATCH',{action:'draft'});
 await call('/api/events/'+parentId,'DELETE');equal(await call('/api/events'),preserved);equal(await call('/api/events','GET',undefined,200,other),otherBefore);if(mediaId)await readFile(mediaId,404);
 console.log(JSON.stringify({prefix,parentId,mediaId,checks,scopedCleanup:true,removedParent:1,removedRemainingMedia:rows.length,unrelatedDataUnchanged:true}));process.exit(0);
}
if(args.includes('--resume-no-media')){
 parentId=option('--event-id');const parent=before.events.find(e=>e.id===parentId);valid(parent);equal(parent.title_bn,prefix);equal(parent.description_bn,description);equal(parent.venue,venue);equal(parent.status,'published');
 for(const key of ['rsvps','comments','media'])equal(before[key].filter(e=>e.event_id===parentId).length,0);
}else parentId=(await call('/api/events','POST',{titleBn:prefix,descriptionBn:description,venue,startAt:'2099-01-01T12:00:00+06:00',status:'published'},201)).id;
const baseline=filtered(before);
const form=new FormData();form.set('file',new File([png],prefix+'.png',{type:'image/png'}));form.set('caption',prefix);
const uploaded=await call('/api/events/'+parentId+'/media','POST',form,201);mediaId=uploaded.id;
equal(uploaded.media.is_current_user,true);equal(eventMediaDeleteAllowed(uploaded.media,false),true);
for(const field of ['uploaded_by_user_id','storage_key','family_id'])equal(Object.hasOwn(uploaded.media,field),false);
const list=await call('/api/events'),listed=list.media.find(e=>e.id===mediaId);equal(listed,uploaded.media);equal(eventMediaDeleteAllowed(listed,false),true);equal(filtered(list),baseline);
await readFile(mediaId);await readFile(mediaId,401,family,false);await readFile(mediaId,404,other);
await call('/api/event-media/'+mediaId,'DELETE',undefined,401,family,false);await call('/api/event-media/'+mediaId,'DELETE',undefined,404,other);
equal((await call('/api/events')).media.find(e=>e.id===mediaId),listed);
const removed=await call('/api/event-media/'+mediaId,'DELETE');equal(removed.id,mediaId);await readFile(mediaId,404);await call('/api/event-media/'+mediaId,'DELETE',undefined,404);
const after=await call('/api/events');equal(after.media.some(e=>e.id===mediaId),false);equal(filtered(after),baseline);equal(await call('/api/events','GET',undefined,200,other),otherBefore);
const audit=(await call('/api/admin')).auditLogs;for(const action of ['event_media_uploaded','event_media_deleted'])equal(audit.filter(e=>e.entity_id===mediaId&&e.action===action).length,1);
await call('/api/events/'+parentId,'PATCH',{action:'draft'});const final=await call('/api/events');equal(final.events.find(e=>e.id===parentId).title_bn,prefix);equal(final.events.find(e=>e.id===parentId).status,'draft');for(const key of ['rsvps','comments','media'])equal(final[key].filter(e=>e.event_id===parentId).length,0);
await call('/api/events/'+parentId,'DELETE');equal(await call('/api/events'),baseline);equal(await call('/api/events','GET',undefined,200,other),otherBefore);
console.log(JSON.stringify({prefix,parentId,mediaId,checks,removedSyntheticMedia:1,removedSyntheticParent:1,unrelatedDataUnchanged:true,auditsRetained:true,realSeparateUsers:false,actualOrdinaryMemberSession:false,browserModals:false}));
