// Opt-in QA for new synthetic parent/RSVP/comment only; no media or delivery.
import assert from 'node:assert/strict';
import {eventReadSnapshot,eventMutationAcknowledged} from '../lib/event-write-outcome.ts';
import {eventParticipationAcknowledged} from '../lib/event-participation.ts';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(!args.includes('--allow-local-qa-writes'))throw Error('Explicit --allow-local-qa-writes required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback origin required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001';
const prefix=args.includes('--prefix')?option('--prefix'):'QA Event Participation '+new Date().toISOString().replace(/\D/g,'').slice(0,14);
if(!/^QA Event Participation \d{14}$/.test(prefix))throw Error('Exact synthetic prefix required.');
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ok=a=>{assert.ok(a);checks++;};
async function call(path,method='GET',body,expected=200,active=family,signed=true,raw=false){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(20000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 const p=await r.json();
 if(method==='POST'&&p.success===true&&p.id)console.log(JSON.stringify({prefix,path,id:p.id,status:r.status}));
 eq(r.status,expected);
 if(method!=='GET'&&r.ok){const match=/^\/api\/events\/([^/]+)\/(rsvp|comments)$/.exec(path);eq(match?eventParticipationAcknowledged(match[2]==='rsvp'?'rsvp':'comment',match[1],body,r.status,p):eventMutationAcknowledged(method,path.split('/')[3],body??{},r.status,p),true);}
 if(method==='GET'&&path==='/api/events'&&r.ok)ok(eventReadSnapshot(p,active));
 return p;
}
const before=await call('/api/events'),otherBefore=await call('/api/events','GET',undefined,200,other);eq(before.family.id,family);eq(before.permissions.canManage,true);eq(before.migrationRequired,false);
let id=args.includes('--event-id')?option('--event-id'):null;
const filtered=p=>({...p,events:p.events.filter(r=>r.id!==id),rsvps:p.rsvps.filter(r=>r.event_id!==id),comments:p.comments.filter(r=>r.event_id!==id),media:p.media.filter(r=>r.event_id!==id)});
if(id){const row=before.events.find(r=>r.id===id);ok(row&&row.title_bn===prefix);}
const unchanged=filtered(before);
if(args.includes('--cleanup')){
 if(!id||!args.includes('--rsvp-id')||!args.includes('--comment-id'))throw Error('Cleanup requires exact parent, RSVP, comment IDs and prefix.');
 eq(before.events.find(r=>r.id===id).status,'draft');const rsvps=before.rsvps.filter(r=>r.event_id===id),comments=before.comments.filter(r=>r.event_id===id);
 eq(rsvps.length,1);eq(rsvps[0].id,option('--rsvp-id'));eq(rsvps[0].is_current_user,true);eq(rsvps[0].response,'not_going');eq(rsvps[0].guest_count,0);eq(rsvps[0].note,prefix+' final RSVP');
 eq(comments.length,1);eq(comments[0].id,option('--comment-id'));eq(comments[0].body,prefix+' synthetic comment');eq(before.media.some(r=>r.event_id===id),false);
 await call('/api/events/'+id,'DELETE');eq(await call('/api/events'),unchanged);eq(await call('/api/events','GET',undefined,200,other),otherBefore);
 await call('/api/events/'+id,'DELETE',undefined,404);await call('/api/events/'+id+'/comments','POST',{body:'Removed fixture check'},404);await call('/api/events/'+id+'/rsvp','POST',{response:'going',guestCount:0},409);
 const logs=(await call('/api/admin')).auditLogs;ok(logs.some(r=>r.entity_id===id&&r.action==='family_event_deleted'));ok(logs.some(r=>r.entity_id===option('--comment-id')&&r.action==='event_comment_created'));ok(logs.some(r=>r.entity_id===option('--rsvp-id')&&r.action==='event_rsvp_saved'));
 console.log(JSON.stringify({prefix,id,checks,parentDeleted:1,linkedSyntheticRowsDeleted:2,unrelatedDataUnchanged:true}));process.exit(0);
}
const parent={titleBn:prefix,descriptionBn:'Synthetic RSVP/comment QA only; not a genuine family announcement.',venue:'QA Participation Location',startAt:'2099-01-01T12:00:00+06:00',registrationDeadline:'2098-12-31T12:00:00+06:00',status:'published'};
if(!id)id=(await call('/api/events','POST',parent,201)).id;
const base='/api/events/'+id,paths={rsvp:base+'/rsvp',comment:base+'/comments'};
for(const [kind,path]of Object.entries(paths)){
 await call(path,'POST',kind==='rsvp'?{response:'going',guestCount:0}:{body:prefix+' synthetic comment'},401,family,false);
 for(const value of [null,[],true])eq((await call(path,'POST',value,400)).code,'EVENT_INVALID_BODY');eq((await call(path,'POST','{',400,family,true,true)).code,'EVENT_INVALID_BODY');
 eq((await call('/api/events/not-a-uuid/'+(kind==='rsvp'?'rsvp':'comments'),'POST',kind==='rsvp'?{response:'going'}:{body:'QA comment'},400)).code,'EVENT_INVALID_ID');
 await call(path,'POST',kind==='rsvp'?{response:'going',guestCount:0}:{body:'QA comment'},kind==='rsvp'?409:404,other);
}
for(const guestCount of [true,false,null,[],1.5,-1,11,'1.0','1e0',''])eq((await call(paths.rsvp,'POST',{response:'going',guestCount},400)).code,'EVENT_RSVP_INVALID_GUESTS');
for(const response of [null,[],true,'constructor','bad'])eq((await call(paths.rsvp,'POST',{response},400)).code,'EVENT_RSVP_INVALID_RESPONSE');
for(const note of [true,[],'x'.repeat(501)])eq((await call(paths.rsvp,'POST',{response:'going',note},400)).code,'EVENT_PARTICIPATION_INVALID_TEXT');
for(const body of [true,[],'x','x'.repeat(2001)])eq((await call(paths.comment,'POST',{body},400)).code,'EVENT_PARTICIPATION_INVALID_TEXT');
let rsvpId;
for(const data of [{response:'going',guestCount:'10',note:' '+prefix+' RSVP '},{response:'maybe',guestCount:2,note:prefix+' RSVP'},{response:'not_going',guestCount:0,note:prefix+' final RSVP'}]){
 const p=await call(paths.rsvp,'POST',data);if(!rsvpId)rsvpId=p.id;eq(p.id,rsvpId);eq(p.rsvp.is_current_user,true);eq(Object.hasOwn(p.rsvp,'auth_user_id'),false);
 const rows=(await call('/api/events')).rsvps.filter(r=>r.event_id===id);eq(rows.length,1);eq(rows[0].id,rsvpId);eq(rows[0].response,data.response);eq(rows[0].guest_count,Number(data.guestCount));
}
const commented=await call(paths.comment,'POST',{body:' '+prefix+' synthetic comment '},201),commentId=commented.id;eq(commented.comment.body,prefix+' synthetic comment');eq(Object.hasOwn(commented.comment,'auth_user_id'),false);eq(Object.hasOwn(commented.comment,'family_id'),false);
await call(base,'PATCH',{action:'edit',data:{...parent,registrationDeadline:'2020-01-01T00:00:00Z'}});eq((await call(paths.rsvp,'POST',{response:'going'},409)).code,'EVENT_REGISTRATION_CLOSED');
await call(base,'PATCH',{action:'edit',data:parent});
for(const action of ['close','complete','cancel','draft']){await call(base,'PATCH',{action});eq((await call(paths.rsvp,'POST',{response:'going'},409)).code,'EVENT_REGISTRATION_CLOSED');}
await call(paths.comment,'POST',{body:'Draft rejection-only check'},404);
const after=await call('/api/events');eq(filtered(after),unchanged);eq(await call('/api/events','GET',undefined,200,other),otherBefore);
const logs=(await call('/api/admin')).auditLogs;eq(logs.filter(r=>r.entity_id===rsvpId&&r.action==='event_rsvp_saved').length,3);ok(logs.some(r=>r.entity_id===commentId&&r.action==='event_comment_created'));
console.log(JSON.stringify({prefix,id,rsvpId,commentId,checks,finalStatus:'draft',unrelatedDataUnchanged:true,cleanupPending:true}));
