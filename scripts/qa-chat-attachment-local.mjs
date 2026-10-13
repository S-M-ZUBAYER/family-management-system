// Opt-in: reuse the exact empty owner-only QA channel; retain one PNG + message
// for the next file-safe deletion slice. Never rerun against a nonempty channel.
import assert from 'node:assert/strict';
import {chatAttachmentInput,chatAttachmentAcknowledged} from '../lib/chat-attachment-policy.ts';
if(!process.argv.includes('--allow-local-qa-writes'))throw Error('Explicit QA write opt-in required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001',channel='9fb84636-dd8f-461b-a7ed-c81bb435decc',name='QA Chat Text 20261013033106';
const prefix='QA Chat Attachment '+new Date().toISOString().replace(/\D/g,'').slice(0,14),caption=prefix+'ক'.repeat(2000-prefix.length);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=','base64'),file=new File([png],prefix+'.png',{type:'image/png'});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=x=>{assert.ok(x);checks++;};
const cookie=active=>'__sites_local_auth=1; fms_active_family='+active;
async function request(path,method='GET',body,expected=200,active=family,signed=true){
 const r=await fetch(new URL(path,origin),{method,headers:signed?{Cookie:cookie(active)}:{},body,signal:AbortSignal.timeout(25000)});
 eq(r.status,expected);return r;
}
const json=async(path,active=family)=>await (await request(path,'GET',undefined,200,active)).json();
const form=()=>{const f=new FormData();f.set('channelId',channel);f.set('file',file);f.set('caption',caption);return f;};
const before=await json('/api/chat'),otherBefore=await json('/api/chat',other),qa=before.channels.find(c=>c.id===channel);
ok(qa);eq(qa.name,name);eq(qa.visibility,'invite_only');eq(qa.memberIds,[before.viewer.authUserId]);eq(before.migrationRequired,false);
const feed=await json('/api/chat?channelId='+channel);eq(feed.channel.created_by_user_id,before.viewer.authUserId);eq(feed.channel.status,'active');for(const k of ['messages','reactions','attachments'])eq(feed[k],[]);
await request('/api/chat/upload','POST',form(),401,family,false);await request('/api/chat/upload','POST',form(),404,other);
await request('/api/chat-file/not-a-uuid','GET',undefined,404);await request('/api/chat-file/20000000-0000-4000-8000-000000000099','GET',undefined,404);
for(const alter of [f=>f.set('file',new File(['wrong'],'fake.png',{type:'image/png'})),f=>f.set('file',new File([png],'wrong.exe',{type:'image/png'})),f=>f.set('caption','ক'.repeat(2001)),f=>f.append('file',file),f=>f.set('auth_user_id','spoof'),f=>f.set('replyToId','bad'),f=>f.set('replyToId','20000000-0000-4000-8000-000000000099')]){
 const f=form();alter(f);const p=await (await request('/api/chat/upload','POST',f,400)).json();ok(['CHAT_FILE_INPUT','CHAT_FILE_INVALID'].includes(p.code));
}
const stillEmpty=await json('/api/chat?channelId='+channel);for(const k of ['messages','reactions','attachments'])eq(stillEmpty[k],[]);
const submitted=form(),r=await request('/api/chat/upload','POST',submitted,201),saved=await r.json();
// Print exact new fixture IDs immediately, before any later assertion failure.
console.log(JSON.stringify({prefix,channelId:channel,messageId:saved.message?.id,attachmentId:saved.attachment?.id,status:r.status,retainedForNextFileDeletion:true}));
eq(chatAttachmentAcknowledged(chatAttachmentInput(submitted),r.status,saved),true);eq(saved.message.body.length,2000);
for(const k of ['family_id','auth_user_id'])eq(Object.hasOwn(saved.message,k),false);for(const k of ['family_id','storage_key','uploaded_by_user_id'])eq(Object.hasOwn(saved.attachment,k),false);
const loaded=await json('/api/chat?channelId='+channel);eq(loaded.messages,[saved.message]);eq(loaded.attachments,[saved.attachment]);eq(loaded.reactions,[]);
const download='/api/chat-file/'+saved.attachment.id;
await request(download,'GET',undefined,401,family,false);await request(download,'GET',undefined,404,other);
const binary=await request(download);eq(Buffer.from(await binary.arrayBuffer()),png);eq(binary.headers.get('Content-Type'),'image/png');eq(binary.headers.get('Cache-Control'),'private, no-store');eq(binary.headers.get('X-Content-Type-Options'),'nosniff');ok(binary.headers.get('Content-Security-Policy').startsWith('sandbox'));ok(binary.headers.get('Content-Disposition').startsWith('inline;'));ok(!binary.headers.get('Content-Disposition').includes('\r'));
const after=await json('/api/chat');eq({...after,channels:after.channels.filter(c=>c.id!==channel)},{...before,channels:before.channels.filter(c=>c.id!==channel)});eq(await json('/api/chat',other),otherBefore);
const audits=(await json('/api/admin')).auditLogs;eq(audits.filter(a=>a.entity_id===saved.attachment.id&&a.action==='chat_attachment_uploaded').length,1);
console.log(JSON.stringify({prefix,channelId:channel,messageId:saved.message.id,attachmentId:saved.attachment.id,fileName:file.name,bytes:file.size,captionLength:caption.length,checks,retainedSyntheticFiles:1,retainedSyntheticMessages:1,unrelatedMetadataUnchanged:true,realSeparateUser:false,browser:false,actualFaultInjection:false}));
