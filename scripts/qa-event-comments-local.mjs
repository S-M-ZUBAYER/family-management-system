// Opt-in QA writes only to a newly named synthetic parent and its own comments.
// No existing family data, files, SQL, or retained audits are removed.
import assert from 'node:assert/strict';
import {eventSafeSnapshot} from '../lib/event-read.ts';
import {eventCommentChangeAcknowledged} from '../lib/event-comment-management.ts';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(!args.includes('--allow-local-qa-writes'))throw Error('Explicit --allow-local-qa-writes required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001';
const prefix=args.includes('--prefix')?option('--prefix'):'QA Event Comments '+new Date().toISOString().replace(/\D/g,'').slice(0,14);
if(!/^QA Event Comments \d{14}$/.test(prefix))throw Error('Exact QA prefix required.');
let checks=0,parentId;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},valid=a=>{assert.ok(a);checks++;};
async function call(path,method='GET',body,expected=200,active=family,signed=true,raw=false){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(25000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 const p=await r.json();
 if(method==='POST'&&p.id&&p.success===true)console.log(JSON.stringify({prefix,path,id:p.id,status:r.status}));
 equal(r.status,expected);
 if(method==='GET'&&path==='/api/events'&&r.ok){valid(eventSafeSnapshot(p));equal(p.family.id,active);}
 if(path.startsWith('/api/event-comments/')&&r.ok)equal(eventCommentChangeAcknowledged(method,path.split('/')[3],parentId,body,r.status,p),true);
 return p;
}
const before=await call('/api/events'),otherBefore=await call('/api/events','GET',undefined,200,other);equal(before.permissions.canManage,true);equal(before.migrationRequired,false);
const unchanged=p=>({...p,events:p.events.filter(e=>e.id!==parentId),rsvps:p.rsvps.filter(e=>e.event_id!==parentId),comments:p.comments.filter(e=>e.event_id!==parentId),media:p.media.filter(e=>e.event_id!==parentId)});
const parent={titleBn:prefix,descriptionBn:'Synthetic comment-management acceptance only; not a genuine family announcement.',venue:'QA Comments Location',startAt:'2099-01-01T12:00:00+06:00',status:'published'};
if(args.includes('--cleanup')){
 parentId=option('--event-id');const candidate=before.events.find(e=>e.id===parentId);valid(candidate);equal(candidate.title_bn,prefix);equal(candidate.description_bn,parent.descriptionBn);equal(candidate.venue,parent.venue);
 equal(before.rsvps.filter(r=>r.event_id===parentId).length,0);equal(before.media.filter(r=>r.event_id===parentId).length,0);
 const children=before.comments.filter(r=>r.event_id===parentId);valid(children.length<=2);for(const row of children){equal(row.is_current_user,true);valid(row.body.startsWith(prefix));}
 const preserved=unchanged(before);if(candidate.status!=='draft')await call('/api/events/'+parentId,'PATCH',{action:'draft'});
 await call('/api/events/'+parentId,'DELETE');equal(await call('/api/events'),preserved);equal(await call('/api/events','GET',undefined,200,other),otherBefore);
 console.log(JSON.stringify({prefix,parentId,checks,scopedCleanup:true,removedParent:1,removedRemainingComments:children.length,unrelatedDataUnchanged:true}));process.exit(0);
}
let resumedComment=null;
if(args.includes('--resume')){
 parentId=option('--event-id');const candidate=before.events.find(e=>e.id===parentId);valid(candidate);equal(candidate.title_bn,prefix);equal(candidate.description_bn,parent.descriptionBn);equal(candidate.venue,parent.venue);equal(candidate.status,'published');
 for(const key of ['rsvps','media'])equal(before[key].filter(e=>e.event_id===parentId).length,0);
 const children=before.comments.filter(e=>e.event_id===parentId);equal(children.length,1);equal(children[0].is_current_user,true);equal(children[0].body,prefix+' #0 বাংলা, quote:" slash:\\ (a.b:*),\nline');resumedComment=children[0];
}else parentId=(await call('/api/events','POST',parent,201)).id;
const baseline=unchanged(before);
const ids=[];
for(let i=0;i<2;i++){
 const original=prefix+` #${i} বাংলা, quote:" slash:\\ (a.b:*),\nline`,create=i===0&&resumedComment?{comment:resumedComment}:await call('/api/events/'+parentId+'/comments','POST',{body:original},201),row=create.comment,id=row.id,path='/api/event-comments/'+id;
 ids.push(id);equal(row.body,original);equal(row.is_current_user,true);equal(Object.hasOwn(row,'auth_user_id'),false);equal(Object.hasOwn(row,'family_id'),false);
 const listed=(await call('/api/events')).comments.find(e=>e.id===id);equal(listed,row);
 for(const method of ['PATCH','DELETE']){
  const data={expectedBody:original,...(method==='PATCH'?{body:prefix+' updated'}:{})};
  await call(path,method,data,401,family,false);await call(path,method,data,404,other);
  for(const bad of [null,[],true])equal((await call(path,method,bad,400)).code,'EVENT_INVALID_BODY');
  equal((await call(path,method,'{',400,family,true,true)).code,'EVENT_INVALID_BODY');
  equal((await call(path,method,{},400)).code,'EVENT_COMMENT_VERSION_REQUIRED');
  equal((await call(path,method,{...data,auth_user_id:'spoof'},400)).code,'EVENT_INVALID_BODY');
  equal((await call(path,method,{...data,expectedBody:'wrong prior text'},409)).code,'EVENT_COMMENT_CHANGED');
 }
 for(const body of ['x',true,[],'x'.repeat(2001)])equal((await call(path,'PATCH',{expectedBody:original,body},400)).code,'EVENT_PARTICIPATION_INVALID_TEXT');
 const initialText=prefix+` #${i} edited বাংলা, quote:" slash:\\ (x.y:*),\nnext`;
 const updated=i===1?initialText+'ক'.repeat(2000-initialText.length):initialText;
 const result=await call(path,'PATCH',{expectedBody:original,body:' '+updated+' '});equal(result.comment.body,updated);equal(result.comment.author_name,row.author_name);equal(result.comment.created_at,row.created_at);equal(result.comment.is_current_user,true);
 equal((await call('/api/events')).comments.find(e=>e.id===id),result.comment);
 equal((await call(path,'PATCH',{expectedBody:original,body:prefix+' stale edit'},409)).code,'EVENT_COMMENT_CHANGED');
 equal((await call(path,'DELETE',{expectedBody:original},409)).code,'EVENT_COMMENT_CHANGED');
 await call('/api/events/'+parentId,'PATCH',{action:'draft'});
 equal((await call(path,'PATCH',{expectedBody:updated,body:prefix+' draft edit'},403)).code,'EVENT_COMMENT_FORBIDDEN');
 await call('/api/events/'+parentId,'PATCH',{action:'publish'});
 const removed=await call(path,'DELETE',{expectedBody:updated});equal(removed.deleted,true);equal(Object.hasOwn(removed,'comment'),false);
 valid(!(await call('/api/events')).comments.some(e=>e.id===id));await call(path,'DELETE',{expectedBody:updated},404);
}
equal((await call('/api/event-comments/not-a-uuid','PATCH',{expectedBody:'QA text',body:'Updated'},400)).code,'EVENT_INVALID_ID');
const snapshot=await call('/api/events');equal(unchanged(snapshot),baseline);equal(await call('/api/events','GET',undefined,200,other),otherBefore);
equal(snapshot.events.find(e=>e.id===parentId).title_bn,prefix);for(const key of ['rsvps','comments','media'])equal(snapshot[key].filter(e=>e.event_id===parentId).length,0);
const audit=(await call('/api/admin')).auditLogs;for(const id of ids)for(const action of ['event_comment_created','event_comment_updated','event_comment_deleted'])equal(audit.filter(e=>e.entity_id===id&&e.action===action).length,1);
await call('/api/events/'+parentId,'PATCH',{action:'draft'});
const final=await call('/api/events'),candidate=final.events.find(e=>e.id===parentId);equal(candidate.status,'draft');equal(candidate.title_bn,prefix);equal(candidate.description_bn,parent.descriptionBn);equal(candidate.venue,parent.venue);for(const key of ['rsvps','comments','media'])equal(final[key].filter(e=>e.event_id===parentId).length,0);
await call('/api/events/'+parentId,'DELETE');equal(await call('/api/events'),baseline);equal(await call('/api/events','GET',undefined,200,other),otherBefore);
console.log(JSON.stringify({prefix,parentId,commentIds:ids,checks,removedOwnComments:2,removedSyntheticParent:1,unrelatedDataUnchanged:true,auditsRetained:true,realSeparateUsers:false,actualModeratorOtherAuthor:false,browserModals:false}));
