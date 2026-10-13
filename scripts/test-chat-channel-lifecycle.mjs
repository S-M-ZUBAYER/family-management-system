import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ChatChannelError, chatLifecycleInput, chatLifecycleAllowed, chatLifecycleWrite, chatLifecycleAcknowledged, chatLifecycleSnapshot, managedChannelPublic, chatLifecycleFeedback, chatLifecycleActionCopy } from '../lib/chat-channel-lifecycle.ts';
const family='20000000-0000-4000-8000-000000000002', id='f8627f9c-53a6-45aa-a0ed-5aef8d639362', stamp='2026-10-13T08:02:53.000Z';
const row={id,family_id:family,name:'QA channel',description:'Private QA',channel_type:'custom',visibility:'invite_only',status:'active',created_by_user_id:'owner',direct_key:null,created_at:stamp,updated_at:stamp};
const body=(r=row,action='edit')=>({action,expectedFamilyId:family,expectedChannelType:r.channel_type,expectedVisibility:r.visibility,expectedName:r.name,expectedDescription:r.description,expectedStatus:r.status,expectedUpdatedAt:r.updated_at,...(action==='edit'?{name:'Edited QA',description:'Edited description'}:{})});
const input=chatLifecycleInput(body());
const options=(extra={})=>({row,input,now:Date.parse(stamp)-10,write:async updatedAt=>[{...row,name:input.name,description:input.description,status:input.status,updated_at:updatedAt}],audit:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
test('strict lifecycle inputs, types, bounds, expected snapshots and protected audience',()=>{
 for(const v of [null,[],{},...Object.entries({action:'delete',expectedFamilyId:'bad',expectedChannelType:'general',expectedVisibility:'admins',expectedName:null,expectedDescription:undefined,expectedStatus:'archived',expectedUpdatedAt:'2026-02-30T00:00:00Z',name:'x',description:'x'.repeat(501),memberIds:[],family_id:family}).map(([k,v])=>({...body(),[k]:v}))])assert.throws(()=>chatLifecycleInput(v),ChatChannelError);
 assert.throws(()=>chatLifecycleInput({...body(row,'archive'),name:'spoof'}));assert.throws(()=>chatLifecycleInput(body(row,'restore')));
 assert.equal(chatLifecycleInput({...body(),description:''}).description,null);
});
test('private access never bypassed by family management role and system-managed types remain protected',()=>{
 for(const role of ['owner','family_admin','manager']){assert.equal(chatLifecycleAllowed(row,role,null),false);assert.equal(chatLifecycleAllowed(row,role,{role:'owner',status:'left'}),false);assert.equal(chatLifecycleAllowed(row,role,{role:'member',status:'active'}),false);assert.equal(chatLifecycleAllowed(row,role,{role:'owner',status:'active'}),true);}
 assert.equal(chatLifecycleAllowed(row,'member',{role:'owner',status:'active'}),false);
 for(const type of ['general','event','qurbani','direct'])assert.equal(chatLifecycleAllowed({...row,channel_type:type},'owner',{role:'owner',status:'active'}),false);
 assert.equal(chatLifecycleAllowed({...row,visibility:'family'},'manager',null),true);assert.equal(chatLifecycleAllowed({...row,visibility:'admins',channel_type:'admin'},'family_admin',null),true);assert.equal(chatLifecycleAllowed({...row,visibility:'invalid'},'owner',{role:'owner',status:'active'}),false);
});
test('confirmed CAS row and monotonic timestamp precede one audit; safe projection only',async()=>{
 const calls=[];const r=await chatLifecycleWrite(options({write:async updatedAt=>{calls.push('row');assert.ok(Date.parse(updatedAt)>Date.parse(stamp));return[{...row,name:input.name,description:input.description,updated_at:updatedAt}];},audit:async()=>calls.push('audit')}));
 assert.deepEqual(calls,['row','audit']);assert.equal(chatLifecycleAcknowledged(id,input,200,r),true);assert.equal(r.noChange,false);for(const k of ['family_id','created_by_user_id','direct_key'])assert.equal(Object.hasOwn(r.channel,k),false);
});
test('archive/restore preserves privacy, creator, type and history metadata with no delete',async()=>{
 const archive=chatLifecycleInput(body(row,'archive'));const a=await chatLifecycleWrite(options({input:archive,write:async t=>[{...row,status:'archived',updated_at:t}]}));assert.equal(a.channel.status,'archived');assert.equal(chatLifecycleAcknowledged(id,archive,200,a),true);
 const archived={...row,status:'archived',updated_at:a.channel.updatedAt};const restore=chatLifecycleInput(body(archived,'restore'));const r=await chatLifecycleWrite(options({row:archived,input:restore,write:async t=>[{...archived,status:'active',updated_at:t}]}));assert.equal(chatLifecycleAcknowledged(id,restore,200,r),true);assert.equal(r.channel.name,row.name);
});
test('no-change writes no record or audit; stale expected row conflicts before mutation',async()=>{
 let count=0;const unchanged=chatLifecycleInput({...body(),name:row.name,description:row.description});const r=await chatLifecycleWrite(options({input:unchanged,write:async()=>{count++;},audit:async()=>count++}));assert.equal(r.noChange,true);assert.equal(count,0);assert.equal(chatLifecycleAcknowledged(id,unchanged,200,r),true);
 for(const patch of [{expectedName:'other'},{expectedFamilyId:'10000000-0000-4000-8000-000000000001'},{expectedUpdatedAt:'2026-10-12T00:00:00Z'},{expectedVisibility:'family'}])await assert.rejects(chatLifecycleWrite(options({input:{...input,...patch},write:async()=>{count++;}})),e=>e.code==='CHAT_CHANNEL_CHANGED');assert.equal(count,0);
});
test('known CAS empty and database rejection are distinct from uncertain writes; no audit after ambiguity',async()=>{
 let audits=0;for(const [write,code] of [[async()=>[],'CHAT_CHANNEL_CHANGED'],[async()=>{throw {status:400};},'CHAT_CHANNEL_REJECTED'],[async()=>{throw Error('lost');},'CHAT_CHANNEL_UNKNOWN'],[async()=>null,'CHAT_CHANNEL_UNKNOWN'],[async()=>[row,row],'CHAT_CHANNEL_UNKNOWN']])await assert.rejects(chatLifecycleWrite(options({write,audit:async()=>audits++})),e=>e.code===code);assert.equal(audits,0);
});
test('returned immutable or mismatched fields reject acknowledgement before audit',async()=>{
 let audits=0;for(const patch of [{visibility:'family'},{family_id:'other'},{created_by_user_id:'other'},{status:'archived'},{created_at:'bad'},{updated_at:'bad'},{name:'other'}])await assert.rejects(chatLifecycleWrite(options({write:async t=>[{...row,name:input.name,description:input.description,updated_at:t,...patch}],audit:async()=>audits++})),e=>e.code==='CHAT_CHANNEL_UNKNOWN');assert.equal(audits,0);
});
test('audit failure yields confirmed pending result, not failed save or compensation',async()=>{
 const r=await chatLifecycleWrite(options({audit:async()=>{throw Error('audit unavailable');}}));assert.equal(r.auditPending,true);assert.equal(chatLifecycleAcknowledged(id,input,202,r),true);assert.equal(chatLifecycleAcknowledged(id,input,200,r),false);assert.equal(chatLifecycleFeedback('/api/chat-channels/'+id,202,r,'en','PATCH',body()).kind,'info');
});
test('malformed acknowledgements cannot produce success and invalid snapshot exposes no stale data',async()=>{
 const r=await chatLifecycleWrite(options());for(const patch of [{channel:null},{action:'archive'},{success:false},{auditPending:true},{channel:{...r.channel,visibility:'family'}},{channel:{...r.channel,direct_key:'secret'}}])assert.equal(chatLifecycleAcknowledged(id,input,200,{...r,...patch}),false);
 const snapshot={familyId:family,actorId:'owner',channels:[managedChannelPublic(row)]};assert.ok(chatLifecycleSnapshot(snapshot));for(const patch of [{channels:[...snapshot.channels,...snapshot.channels]},{channels:[{...snapshot.channels[0],family_id:family}]},{channels:[{...snapshot.channels[0],updatedAt:'bad'}]},{actorId:null}])assert.equal(chatLifecycleSnapshot({...snapshot,...patch}),null);
});
test('BN/EN edit/archive/restore confirmation and typed success/error/unknown/modal branches',async()=>{
 const path='/api/chat-channels/'+id,r=await chatLifecycleWrite(options());for(const locale of ['bn','en']){for(const action of ['edit','archive','restore']){const copy=chatLifecycleActionCopy(path,'PATCH',{action},locale);assert.ok(copy.title&&copy.description&&copy.confirmLabel);assert.equal(copy.destructive,action==='archive');}assert.equal(chatLifecycleFeedback(path,200,r,locale,'PATCH',body()).kind,'success');assert.equal(chatLifecycleFeedback(path,200,{},locale,'PATCH',body()).kind,'info');assert.equal(chatLifecycleFeedback(path,409,{code:'CHAT_CHANNEL_CHANGED'},locale,'PATCH',body()).kind,'error');assert.equal(chatLifecycleFeedback(path,503,{},locale,'PATCH',body()).kind,'info');}
 assert.equal(chatLifecycleActionCopy('/api/chat','PATCH',{},'en'),null);
});
test('separate management lookup, scoped CAS, no deletion and confirmation/cancellation/recovery wiring',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');const server=read('lib/chat-channel-management-server.ts'),route=read('app/api/chat-channels/[id]/route.ts'),ui=read('app/chat/channels/channel-management.tsx'),provider=read('components/action-modal-provider.tsx'),access=read('lib/family-chat.ts');
 assert.match(server,/chatLifecycleAllowed/);assert.match(server,/family_id: `eq\.\$\{membership.family_id\}`/);assert.match(route,/getActiveFamilyMembership/);assert.match(route,/updated_at: `eq\.\$\{input.expectedUpdatedAt\}`/);assert.match(route,/return=representation/);assert.doesNotMatch(route,/method: "DELETE"/);assert.match(access,/status: "eq.active"/);assert.match(ui,/r.status === 499/);assert.match(ui,/body: JSON.stringify\(body\)/);assert.match(ui,/setUncertain\(captured\)/);assert.match(ui,/p.familyId !== captured.input.expectedFamilyId/);assert.match(ui,/<fieldset disabled=\{busy\}/);assert.match(provider,/chatLifecycleActionCopy/);assert.match(provider,/lifecycleResult/);assert.match(provider,/lifecycleFailure/);
});
