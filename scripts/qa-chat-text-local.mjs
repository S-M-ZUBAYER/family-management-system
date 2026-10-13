// Opt-in: one private QA channel, two synthetic text messages only.
// Messages are removed; empty invite-only channel is retained for next channel QA.
import assert from 'node:assert/strict';
import {chatTextAcknowledged,chatFeedSnapshot} from '../lib/chat-text-management.ts';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];if(!args.includes('--allow-local-qa-writes'))throw Error('Explicit QA write opt-in required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001';
const prefix=args.includes('--prefix')?option('--prefix'):'QA Chat Text '+new Date().toISOString().replace(/\D/g,'').slice(0,14);
if(!/^QA Chat Text \d{14}$/.test(prefix))throw Error('Exact QA prefix required.');
let checks=0,channelId;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=a=>{assert.ok(a);checks++;};
async function call(path,method='GET',body,expected=200,active=family,signed=true){
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(25000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const p=await r.json();
 if(method==='POST'&&r.ok&&(p.channelId||p.message?.id))console.log(JSON.stringify({prefix,path,channelId:p.channelId??channelId,messageId:p.message?.id,status:r.status}));
 if(r.status!==expected)console.log(JSON.stringify({path,status:r.status,expected,code:p.code??null}));eq(r.status,expected);
 if(path.startsWith('/api/chat-messages/')&&r.ok)eq(chatTextAcknowledged(method,path.split('/')[3],channelId,body,r.status,p),true);
 return p;
}
const before=await call('/api/chat'),otherBefore=await call('/api/chat','GET',undefined,200,other);eq(before.permissions.canManage,true);eq(before.migrationRequired,false);
if(args.includes('--resume-after-reaction')){
 channelId=option('--channel-id');const qa=before.channels.find(c=>c.id===channelId);ok(qa);eq(qa.name,prefix);eq(qa.visibility,'invite_only');eq(qa.memberIds,[before.viewer.authUserId]);
}else channelId=(await call('/api/chat','POST',{action:'create_channel',channelType:'custom',visibility:'invite_only',name:prefix,description:'Private synthetic text QA only; not a genuine family announcement.',memberIds:[]},201)).channelId;
const baseline={...before,channels:before.channels.filter(c=>c.id!==channelId)};
const feed=async()=>{const p=await call('/api/chat?channelId='+channelId);ok(chatFeedSnapshot(p,channelId));return p;};
const original=prefix+' বাংলা, quote:" slash:\\ (x.y),\nline';
let parent,child,restored;
if(args.includes('--resume-after-reaction')){
 const current=await feed();eq(current.channel.name,prefix);eq(current.channel.visibility,'invite_only');eq(current.channel.created_by_user_id,before.viewer.authUserId);eq(current.messages.length,2);eq(current.attachments,[]);
 parent=current.messages.find(m=>m.id===option('--parent-id'));child=current.messages.find(m=>m.id===option('--child-id'));ok(parent);ok(child);eq(parent.body,original);eq(parent.is_mine,true);ok(parent.edited_at);eq(child.body,prefix+' reply');eq(child.is_mine,true);eq(child.edited_at,null);eq(child.reply_to_id,parent.id);eq(current.reactions.length,1);eq(current.reactions[0].message_id,parent.id);eq(current.reactions[0].emoji,'👍');eq(current.reactions[0].is_mine,true);restored=parent;
}else{
parent=(await call('/api/chat','POST',{action:'send_message',channelId,body:original},201)).message;
child=(await call('/api/chat','POST',{action:'send_message',channelId,body:prefix+' reply',replyToId:parent.id},201)).message;
eq(child.reply_to_id,parent.id);const path='/api/chat-messages/'+parent.id,base={expectedBody:original,expectedEditedAt:null};
for(const method of ['PATCH','DELETE']){
 const input={...base,...(method==='PATCH'?{body:prefix+' updated'}:{})};await call(path,method,input,401,family,false);await call(path,method,input,404,other);
 for(const value of [null,[],true,{...input,auth_user_id:'spoof'}])eq((await call(path,method,value,400)).code,'CHAT_TEXT_INVALID_INPUT');
 eq((await call(path,method,{...input,expectedBody:'wrong prior text'},409)).code,'CHAT_TEXT_CHANGED');
 eq((await call(path,method,{expectedBody:original,...(method==='PATCH'?{body:'Updated'}:{})},400)).code,'CHAT_TEXT_INVALID_VERSION');
}
for(const value of ['',null,true,'x'.repeat(5001)])eq((await call(path,'PATCH',{...base,body:value},400)).code,'CHAT_TEXT_INVALID_BODY');
const longText=prefix+'ক'.repeat(5000-prefix.length),edited=(await call(path,'PATCH',{...base,body:longText})).message;
eq(edited.body,longText);eq(edited.author_name,parent.author_name);eq(edited.created_at,parent.created_at);eq(edited.is_mine,true);ok(Date.parse(edited.edited_at)>Date.parse(parent.created_at));for(const field of ['family_id','auth_user_id'])eq(Object.hasOwn(edited,field),false);
eq((await feed()).messages.find(m=>m.id===parent.id),edited);
eq((await call(path,'PATCH',{...base,body:'Stale edit'},409)).code,'CHAT_TEXT_CHANGED');eq((await call(path,'DELETE',base,409)).code,'CHAT_TEXT_CHANGED');
restored=(await call(path,'PATCH',{expectedBody:longText,expectedEditedAt:edited.edited_at,body:original})).message;ok(Date.parse(restored.edited_at)>Date.parse(edited.edited_at));
eq((await call(path,'PATCH',{...base,body:'ABA stale edit'},409)).code,'CHAT_TEXT_CHANGED');
await call('/api/chat','POST',{action:'toggle_reaction',channelId,messageId:parent.id,emoji:'👍'},201);ok((await feed()).reactions.some(r=>r.message_id===parent.id));
}
const path='/api/chat-messages/'+parent.id;
await call(path,'DELETE',{expectedBody:restored.body,expectedEditedAt:restored.edited_at});const after=await feed();eq(after.messages.some(m=>m.id===parent.id),false);eq(after.reactions.some(r=>r.message_id===parent.id),false);eq(after.messages.find(m=>m.id===child.id).reply_to_id,null);
await call(path,'DELETE',{expectedBody:restored.body,expectedEditedAt:restored.edited_at},404);
await call('/api/chat-messages/'+child.id,'DELETE',{expectedBody:child.body,expectedEditedAt:null});const empty=await feed();for(const key of ['messages','reactions','attachments'])eq(empty[key],[]);
const meta=await call('/api/chat'),qa=meta.channels.find(c=>c.id===channelId);eq(qa.name,prefix);eq(qa.visibility,'invite_only');eq(qa.memberIds,[before.viewer.authUserId]);
eq({...meta,channels:meta.channels.filter(c=>c.id!==channelId)},baseline);eq(await call('/api/chat','GET',undefined,200,other),otherBefore);
const audit=(await call('/api/admin')).auditLogs;eq(audit.filter(a=>a.entity_id===parent.id&&a.action==='chat_message_edited').length,2);for(const id of [parent.id,child.id])eq(audit.filter(a=>a.entity_id===id&&a.action==='chat_message_deleted').length,1);
console.log(JSON.stringify({prefix,channelId,messageIds:[parent.id,child.id],checks,resumedAfterReaction:args.includes('--resume-after-reaction'),removedSyntheticMessages:2,retainedEmptyPrivateChannel:true,unrelatedMetadataUnchanged:true,auditsRetained:true,realSeparateUsers:false,browserModals:false,attachmentDeletion:false}));
