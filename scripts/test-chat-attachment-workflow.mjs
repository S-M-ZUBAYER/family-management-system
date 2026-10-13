import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ChatAttachmentError,chatAttachmentMetadata,chatAttachmentInput,chatAttachmentHeaderMatches,validateChatAttachment,chatAttachmentKey,chatAttachmentPublic,chatAttachmentAcknowledged,chatAttachmentCopy,chatAttachmentFeedback,readChatAttachmentChange,chatAttachmentActionCopy} from '../lib/chat-attachment-policy.ts';
import {chatAttachmentWrite} from '../lib/chat-attachment-write.ts';
const family='20000000-0000-4000-8000-000000000002',channel='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000011',attachmentId='20000000-0000-4000-8000-000000000012',other='20000000-0000-4000-8000-000000000013',actor='qa-owner';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=','base64'),file=new File([png],'QA.png',{type:'image/png'}),metadata=chatAttachmentMetadata(file),key=`families/${family}/chat/${channel}/${attachmentId}.png`;
const message={id,family_id:family,channel_id:channel,auth_user_id:actor,author_name:'QA author',message_type:'attachment',body:'QA caption',reply_to_id:null,edited_at:null,created_at:'2026-10-13T04:00:00Z'};
const attachment={id:attachmentId,family_id:family,channel_id:channel,message_id:id,storage_key:key,uploaded_by_user_id:actor,file_name:file.name,mime_type:file.type,file_size:file.size,created_at:message.created_at};
const opts=(extra={})=>({familyId:family,channelId:channel,actorId:actor,messageId:id,attachmentId,key,file:metadata,caption:message.body,replyToId:null,put:async()=>{},createMessage:async()=>[message],createAttachment:async()=>[attachment],removeMessage:async()=>[message],discard:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,sync:async()=>{},audit:async()=>{},...extra});
const form=()=>{const f=new FormData();f.set('file',file);f.set('channelId',channel);f.set('caption',' QA caption ');return f;};
const input=chatAttachmentInput(form());
test('metadata/input reject unsafe names, MIME extension mismatch, sizes, duplicates, coercion and silent truncation',()=>{
 for(const patch of [{name:''},{name:'../QA.png'},{name:'Q\\A.png'},{name:'x\0.png'},{name:'x'.repeat(221)},{name:'QA.exe'},{name:undefined},{type:undefined},{type:'constructor'},{type:'image/svg+xml'},{size:0},{size:'1'},{size:1.5},{size:8*1024*1024+1}])assert.throws(()=>chatAttachmentMetadata({...metadata,...patch}),ChatAttachmentError);
 assert.equal(chatAttachmentMetadata({name:'voice.webm',type:'audio/webm;codecs=opus',size:15*1024*1024}).type,'audio/webm');
 for(const [type,name,max] of [['video/mp4','v.mp4',25],['audio/mpeg','a.mp3',15],['application/pdf','d.pdf',10]]){chatAttachmentMetadata({name,type,size:max*1024*1024});assert.throws(()=>chatAttachmentMetadata({name,type,size:max*1024*1024+1}),ChatAttachmentError);}
 for(const modify of [f=>f.set('channelId','-'.repeat(36)),f=>f.set('replyToId','bad'),f=>f.set('caption','ক'.repeat(2001)),f=>f.append('file',file),f=>f.append('caption','duplicate'),f=>f.set('auth_user_id','spoof')]){const f=form();modify(f);assert.throws(()=>chatAttachmentInput(f),ChatAttachmentError);}
 assert.equal(input.caption,'QA caption');const f=form();f.set('caption','ক'.repeat(2000));assert.equal(chatAttachmentInput(f).caption.length,2000);
});
test('bounded headers accept supported containers and reject HTML masquerading as each type',async()=>{
 await validateChatAttachment(file);await assert.rejects(validateChatAttachment(new File(['<script>wrong</script>'],'QA.png',{type:'image/png'})),ChatAttachmentError);
 for(const type of ['image/png','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/x-m4a','audio/webm','audio/ogg','audio/wav','application/pdf','application/msword','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])assert.equal(chatAttachmentHeaderMatches(type,Buffer.from('<script>wrong type</script>'),26),false);
 const mp4=Buffer.alloc(24);mp4.writeUInt32BE(24);mp4.write('ftypisom',4);assert.equal(chatAttachmentHeaderMatches('audio/mp4',mp4,24),true);
 const webm=Buffer.from([26,69,223,163,135,66,130,132,119,101,98,109]);assert.equal(chatAttachmentHeaderMatches('audio/webm',webm,12),true);
 const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36,4);wav.write('WAVE',8);assert.equal(chatAttachmentHeaderMatches('audio/wav',wav,44),true);assert.equal(chatAttachmentHeaderMatches('audio/wav',wav,45),false);
 const ogg=Buffer.alloc(27);ogg.write('OggS');assert.equal(chatAttachmentHeaderMatches('audio/ogg',ogg,27),true);
 assert.equal(chatAttachmentHeaderMatches('audio/mpeg',Buffer.from('ID3\x04\0\0\0\0\0\0'),10),true);
 assert.equal(chatAttachmentHeaderMatches('application/pdf',Buffer.from('%PDF-1.7'),8),true);
 const ole=Buffer.alloc(512);Buffer.from([208,207,17,224,161,177,26,225]).copy(ole);assert.equal(chatAttachmentHeaderMatches('application/msword',ole,512),true);
 const zip=Buffer.alloc(30);Buffer.from([80,75,3,4]).copy(zip);assert.equal(chatAttachmentHeaderMatches('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',zip,30),true);
});
test('captured storage keys and public rows cannot expose arbitrary or other-family objects',()=>{
 assert.equal(chatAttachmentKey(key,family,channel),true);
 for(const wrong of [key.replace(family,other),key.replace(channel,other),key+'/x',key.replace('.png','.html'),key.replace(attachmentId,'..'),key.replace('/chat/','/events/')])assert.equal(chatAttachmentKey(wrong,family,channel),false);
 const p=chatAttachmentPublic(attachment);for(const k of ['family_id','storage_key','uploaded_by_user_id'])assert.equal(Object.hasOwn(p,k),false);
 for(const patch of [{created_at:''},{created_at:'bad'},{id:'bad'},{file_size:'1'},{file_name:'../x.png'}])assert.equal(chatAttachmentPublic({...attachment,...patch}),null);
});
test('confirmed writes preserve public records through independent refresh/audit outages',async()=>{
 for(const syncPending of [false,true])for(const auditPending of [false,true]){
  const order=[],result=await chatAttachmentWrite(opts({put:async()=>order.push('put'),createMessage:async()=>{order.push('message');return[message];},createAttachment:async()=>{order.push('attachment');return[attachment];},discard:async()=>assert.fail('discard saved file'),removeMessage:async()=>assert.fail('delete saved message'),sync:async()=>{order.push('sync');if(syncPending)throw Error('simulated');},audit:async()=>{order.push('audit');if(auditPending)throw Error('simulated');}}));
  assert.deepEqual(order,['put','message','attachment','sync','audit']);assert.equal(result.syncPending,syncPending);assert.equal(result.auditPending,auditPending);
  const pending=syncPending||auditPending,payload={...result,...(pending?{code:'CHAT_FILE_PENDING'}:{})};assert.equal(chatAttachmentAcknowledged(input,pending?202:201,payload),true);
  for(const k of ['family_id','auth_user_id'])assert.equal(Object.hasOwn(result.message,k),false);
 }
});
test('definite prewrite/message/attachment rejection uses only confirmed captured rollback before discard',async()=>{
 for(const stage of ['put','message','attachment']){const order=[];await assert.rejects(chatAttachmentWrite(opts({put:async()=>{order.push('put');if(stage==='put')throw Error('failed');},createMessage:async()=>{order.push('message');if(stage==='message')throw {status:409};return[message];},createAttachment:async()=>{order.push('attachment');throw {status:409};},removeMessage:async row=>{order.push('remove');assert.deepEqual(row,message);return[message];},discard:async()=>order.push('discard'),sync:async()=>assert.fail('sync'),audit:async()=>assert.fail('audit')})),e=>e.code==='CHAT_FILE_REJECTED');assert.deepEqual(order,stage==='put'?['put','discard']:stage==='message'?['put','message','discard']:['put','message','attachment','remove','discard']);}
 for(const rollback of [[],[{}],[{...message,family_id:other}],[{...message,body:'changed'}]])await assert.rejects(chatAttachmentWrite(opts({createAttachment:async()=>{throw {status:409};},removeMessage:async()=>rollback,discard:async()=>assert.fail('unconfirmed discard')})),e=>e.code==='CHAT_FILE_UNKNOWN');
 await assert.rejects(chatAttachmentWrite(opts({put:async()=>{throw Error('failed');},discard:async()=>{throw Error('failed');}})),e=>e.code==='CHAT_FILE_UNKNOWN');
});
test('ambiguous or wrong-scope inserts never compensate, audit, refresh or retry',async()=>{
 for(const stage of ['message','attachment'])for(const value of [null,{},[],[{}],[stage==='message'?{...message,auth_user_id:'other'}:{...attachment,storage_key:key+'x'}]]){
  await assert.rejects(chatAttachmentWrite(opts({[stage==='message'?'createMessage':'createAttachment']:async()=>value,discard:async()=>assert.fail('discard'),removeMessage:async()=>assert.fail('rollback'),audit:async()=>assert.fail('audit'),sync:async()=>assert.fail('sync')})),e=>e.code==='CHAT_FILE_UNKNOWN');
 }
 for(const error of [Error('lost response'),{status:408},{status:502}])for(const stage of ['createMessage','createAttachment'])await assert.rejects(chatAttachmentWrite(opts({[stage]:async()=>{throw error;},discard:async()=>assert.fail('discard'),removeMessage:async()=>assert.fail('rollback')})),e=>e.code==='CHAT_FILE_UNKNOWN');
});
test('acknowledgements/cancellation/unknown responses and bilingual modal copy are distinct',async()=>{
 const p=await chatAttachmentWrite(opts());
 for(const raw of [{},{...p,success:'true'},{...p,message:{...p.message,channel_id:other}},{...p,attachment:{...p.attachment,message_id:other}},{...p,auditPending:'true'},{...p,outcomeUnknown:true}])assert.equal(chatAttachmentAcknowledged(input,201,raw),false);
 assert.equal(chatAttachmentAcknowledged(input,202,p),false);
 for(const [status,payload,kind]of [[499,null,'cancelled'],[400,{code:'CHAT_FILE_INPUT'},'rejected'],[413,null,'rejected'],[503,{code:'CHAT_FILE_STORAGE'},'rejected'],[503,{code:'CHAT_FILE_REJECTED'},'rejected'],[503,{},'unknown'],[408,{},'unknown'],[201,{},'unknown'],[201,p,'confirmed']])assert.equal((await readChatAttachmentChange(async()=>Response.json(payload,{status}),input)).kind,kind);
 assert.equal((await readChatAttachmentChange(async()=>{throw Error('lost');},input)).kind,'unknown');
 for(const locale of ['bn','en']){for(const code of ['CHAT_FILE_INPUT','CHAT_FILE_INVALID','CHAT_FILE_PENDING','CHAT_FILE_REJECTED','CHAT_FILE_STORAGE','CHAT_FILE_UNKNOWN'])assert.ok(chatAttachmentCopy(code,locale));assert.equal(chatAttachmentFeedback('/api/chat/upload',503,{},locale).kind,'info');assert.equal(chatAttachmentFeedback('/api/chat/upload',201,p,locale,form()),null);assert.equal(chatAttachmentFeedback('/api/chat/upload',413,{},locale).kind,'error');assert.ok(chatAttachmentActionCopy('/api/chat/upload','POST',locale).description.includes('Cancel/×'));}
 assert.equal(chatAttachmentFeedback('/api/chat',503,{},'en'),null);
});
test('routes and UI require family/channel/parent access, private no-store downloads, captured rollback and verification',()=>{
 const upload=readFileSync(new URL('../app/api/chat/upload/route.ts',import.meta.url),'utf8'),fileRoute=readFileSync(new URL('../app/api/chat-file/[id]/route.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/family-chat.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 for(const t of ['getActiveFamilyMembership(user.userId)','getAccessibleChatChannel','validateChatAttachment','chatAttachmentWrite','chat_attachment_uploaded','return=representation','target.set("created_at"','target.set("body"','target.set("reply_to_id"'])assert.ok(upload.includes(t),t);
 for(const t of ['noticeUuid(id)','chatAttachmentKey','chatAttachmentPublic','getAccessibleChatChannel','message_type: "eq.attachment"','private, no-store','sandbox; default-src','object.size !== attachment.file_size'])assert.ok(fileRoute.includes(t),t);
 for(const t of ['readChatAttachmentChange','textState.current.busy=true','setVerifyChannel(channelId)','if(response.status===499)','outcome.kind==="cancelled"','setPendingFile(null)'])assert.ok(ui.includes(t),t);
 assert.ok(provider.includes('chatAttachmentActionCopy(pathname,method,locale)'));assert.ok(provider.includes('attachmentResult ??'));assert.ok(provider.includes('attachmentFailure ??'));
});
