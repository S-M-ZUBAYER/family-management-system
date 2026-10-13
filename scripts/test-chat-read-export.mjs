import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import * as XLSX from 'xlsx';
import {ChatReadGate,ChatReadError,chatMetadataSnapshot,chatScopedFeed,readChatJson,chatReadCopy} from '../lib/chat-read.ts';
import {chatExportSnapshot,chatHistoryWorkbook,chatMembershipWorkbook} from '../lib/chat-export.ts';
const family='20000000-0000-4000-8000-000000000002',id='f8627f9c-53a6-45aa-a0ed-5aef8d639362',messageId='20000000-0000-4000-8000-000000000091',fileId='20000000-0000-4000-8000-000000000092',reactionId='20000000-0000-4000-8000-000000000093',actor='qa-owner',stamp='2026-10-13T08:00:00.000Z',scope={familyId:family,actorId:actor};
const member={authUserId:actor,name:'QA Owner',initials:'QO',role:'owner'};
const meta={family:{id:family,name_bn:'QA পরিবার',name_en:'QA Family'},viewer:{authUserId:actor,name:member.name,role:'owner'},members:[member],channels:[{id,name:'QA group',description:'Private',channelType:'custom',visibility:'invite_only',updatedAt:stamp,unreadCount:0,memberCount:1,memberIds:[actor],notificationLevel:'all',ownPreference:{membershipId:messageId,updatedAt:stamp}}],migrationRequired:false,permissions:{canManage:true}};
const message={id:messageId,channel_id:id,author_name:'=Literal sender',message_type:'text',body:'=HYPERLINK("https://invalid.example","literal")',reply_to_id:null,created_at:stamp,edited_at:null,is_mine:true};
const history={scope,channel:{id,name:'QA group',description:'Private',channel_type:'custom',visibility:'invite_only',status:'active',created_at:stamp,updated_at:stamp},messages:[message],reactions:[{id:reactionId,message_id:messageId,emoji:'❤️',created_at:stamp,is_mine:true}],attachments:[{id:fileId,channel_id:id,message_id:messageId,file_name:'=Literal.png',mime_type:'image/png',file_size:68,created_at:stamp,is_mine:true}],participants:[{name:'QA Owner',role:'owner'}]};
const roster={familyId:family,actorId:actor,channel:{id,name:'QA group',updatedAt:stamp},members:[{id:messageId,userId:actor,role:'owner',status:'active',notificationLevel:'all',createdAt:stamp,updatedAt:stamp}],eligible:[]};
const response=(body,status=200)=>Response.json(body,{status});const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('strict complete metadata validates privacy, roles, versions and bounded duplicate-free data',()=>{
 assert.ok(chatMetadataSnapshot(meta));for(const patch of [{members:[]},{viewer:{...meta.viewer,role:'member'}},{permissions:{canManage:false}},{migrationRequired:'false'},{channels:[meta.channels[0],meta.channels[0]]},{channels:[{...meta.channels[0],memberIds:[]}]},{channels:[{...meta.channels[0],unreadCount:'0'}]},{channels:[{...meta.channels[0],ownPreference:null,notificationLevel:'muted'}]},{channels:[{...meta.channels[0],direct_key:'private'}]}])assert.equal(chatMetadataSnapshot({...meta,...patch}),null);
 assert.ok(chatMetadataSnapshot({...meta,migrationRequired:true,channels:[]}));assert.equal(chatMetadataSnapshot({...meta,migrationRequired:true}),null);
});
test('feed/export binds family actor and channel; full history rejects orphan/duplicate/out-of-scope data',()=>{
 assert.ok(chatScopedFeed(history,id,scope));assert.ok(chatExportSnapshot(history,id,scope));for(const patch of [{scope:{...scope,actorId:'other'}},{scope:{...scope,familyId:messageId}},{channel:{...history.channel,id:messageId}},{messages:[{...message,reply_to_id:fileId}]},{messages:[message,message]},{participants:[{name:'QA',role:'spoof'}]},{attachments:[{...history.attachments[0],message_id:fileId}]}])assert.equal(chatExportSnapshot({...history,...patch},id,scope),null);
 assert.equal(chatExportSnapshot({...history,channel:{...history.channel,status:'archived'}},id,scope),null);
});
test('read handles fetch/JSON and exact coded auth/setup/row-limit/malformed/network failures without retry',async()=>{
 assert.deepEqual(await readChatJson(async()=>response(meta),chatMetadataSnapshot),meta);
 for(const [status,body,code]of [[401,{},'CHAT_READ_SIGN_IN'],[403,{},'CHAT_READ_ACCESS'],[404,{},'CHAT_READ_ACCESS'],[413,{},'CHAT_ROW_LIMIT'],[409,{code:'FAMILY_SETUP_REQUIRED'},'CHAT_READ_SETUP'],[409,{},'CHAT_READ_ACCESS'],[503,{},'CHAT_READ_FAILED'],[200,null,'CHAT_READ_INVALID']]){let calls=0;await assert.rejects(readChatJson(async()=>{calls++;return response(body,status);},chatMetadataSnapshot),e=>e.code===code);assert.equal(calls,1);}
 await assert.rejects(readChatJson(async()=>{throw Error('offline');},chatMetadataSnapshot),e=>e.code==='CHAT_READ_FAILED');await assert.rejects(readChatJson(async()=>new Response('not JSON'),chatMetadataSnapshot),ChatReadError);
});
test('deadline covers stalled fetch and stalled JSON even when AbortSignal is ignored',async()=>{
 for(const request of [async()=>new Promise(()=>{}),async()=>({status:200,ok:true,json:()=>new Promise(()=>{})})])await assert.rejects(readChatJson(request,chatMetadataSnapshot,undefined,10),e=>e.code==='CHAT_READ_TIMEOUT');
});
test('obsolete requests are aborted and cannot commit late JSON after a newer ticket',async()=>{
 const gate=new ChatReadGate(),ticket=gate.begin(),json=deferred(),commits=[];
 const old=readChatJson(async()=>({status:200,ok:true,json:()=>json.promise}),chatMetadataSnapshot,ticket.controller.signal).then(p=>{if(gate.current(ticket))commits.push(p);}).catch(()=>{});
 await Promise.resolve();const latest=gate.begin();assert.equal(ticket.controller.signal.aborted,true);const p=await readChatJson(async()=>response(meta),chatMetadataSnapshot,latest.controller.signal);if(gate.current(latest))commits.push(p);json.resolve(meta);await old;assert.equal(commits.length,1);gate.invalidate();assert.equal(gate.current(latest),false);
});
test('abort/invalidate/unmount/deferred-error suppression is independent of transport cancellation',async()=>{
 const gate=new ChatReadGate(),t=gate.begin();gate.invalidate();let errors=0;await readChatJson(async()=>response(meta),chatMetadataSnapshot,t.controller.signal).catch(()=>{if(gate.current(t))errors++;});assert.equal(errors,0);
});
test('BN/EN complete-history workbooks have five sheets, native UTC dates/numbers, literal text and empty headers',()=>{
 for(const locale of ['bn','en']){const book=chatHistoryWorkbook(XLSX,history,id,scope,locale);assert.equal(book.SheetNames.length,5);const roundtrip=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellDates:false});const messages=roundtrip.Sheets[roundtrip.SheetNames[0]],files=roundtrip.Sheets[roundtrip.SheetNames[3]];assert.equal(messages.D2.v,message.body);assert.equal(messages.D2.t,'s');assert.equal(messages.D2.f,undefined);assert.equal(messages.F2.t,'n');assert.equal(messages.F2.v,46308+8/24);assert.equal(files.E2.t,'n');assert.equal(files.E2.v,68);assert.equal(files.C2.f,undefined);assert.equal(messages.H2.v,'UTC');
 const empty=chatHistoryWorkbook(XLSX,{...history,messages:[],reactions:[],attachments:[],participants:[]},id,scope,locale);for(const sheet of empty.SheetNames)assert.ok(empty.Sheets[sheet].A1);}
});
test('full export is not limited to latest 150 messages; 20,000-row cap and native date limits are enforced',()=>{
 const many=Array.from({length:20000},(_,i)=>({...message,id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0'),body:'Synthetic '+i})),large={...history,messages:many,reactions:[],attachments:[]};assert.ok(chatExportSnapshot(large,id,scope));const book=chatHistoryWorkbook(XLSX,large,id,scope,'en');assert.equal(XLSX.utils.decode_range(book.Sheets.Messages['!ref']).e.r,20000);assert.equal(chatExportSnapshot({...large,messages:[...many,{...message,id:fileId}]},id,scope),null);
 assert.throws(()=>chatHistoryWorkbook(XLSX,{...history,messages:[{...message,created_at:'1899-01-01T00:00:00Z'}]},id,scope,'en'));
});
test('owner-authorized membership workbook excludes account IDs and eligibility payload, retains UTC versions',()=>{
 for(const locale of ['bn','en']){const b=chatMembershipWorkbook(XLSX,roster,id,scope,locale);assert.equal(b.SheetNames.length,2);const r=XLSX.read(XLSX.write(b,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellDates:false}),s=r.Sheets[r.SheetNames[0]];assert.equal(s.F2.t,'n');assert.equal(s.H2.v,'UTC');const vals=Object.values(s).filter(v=>v&&typeof v==='object'&&Object.hasOwn(v,'v')).map(v=>v.v);assert.equal(vals.includes(actor),false);assert.equal(vals.includes(family),false);assert.equal(vals.includes(messageId),true);}
 assert.throws(()=>chatMembershipWorkbook(XLSX,roster,id,{...scope,actorId:'other'},'en'));
});
test('localized read errors plus source guard/timeout/Retry/scope/fresh-roster wiring',()=>{
 for(const locale of ['bn','en'])for(const code of ['CHAT_READ_TIMEOUT','CHAT_READ_INVALID','CHAT_READ_ACCESS','CHAT_ROW_LIMIT','CHAT_READ_SUPERSEDED'])assert.ok(chatReadCopy(code,locale));
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),ui=read('app/family-chat.tsx'),route=read('app/api/chat/route.ts'),members=read('app/chat/channels/[id]/members/membership-management.tsx');
 assert.match(ui,/metadataRead.current.begin/);assert.match(ui,/workspaceScope.current=null/);assert.match(ui,/setFeedReadFailed\(true\)/);assert.match(ui,/chatScopedFeed/);assert.match(ui,/CHAT_READ_SUPERSEDED/);assert.match(ui,/chatHistoryWorkbook/);assert.match(ui,/Retry loading/);assert.match(route,/channel: publicChannel/);assert.match(route,/participants = familyMembers.filter/);assert.match(route,/currentMembership.family_id!==membership.family_id/);assert.match(members,/chatMembershipWorkbook/);assert.match(members,/readChatJson/);assert.match(members,/parsed.actorId===captured.actorId/);
});
