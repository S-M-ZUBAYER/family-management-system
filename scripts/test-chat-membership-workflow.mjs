import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ChatMembershipError, chatMembershipInput, chatMembershipMayManage, chatMembershipPublic, chatMembershipPlan, chatMembershipWrite, chatMembershipAcknowledged, chatMembershipSnapshot, chatMembershipActionCopy, chatMembershipFeedback } from '../lib/chat-membership-workflow.ts';
const family='20000000-0000-4000-8000-000000000002', channelId='f8627f9c-53a6-45aa-a0ed-5aef8d639362', id='20000000-0000-4000-8000-000000000091', ownId='20000000-0000-4000-8000-000000000092', actor='qa-owner', target='qa-approved-target', stamp='2026-10-13T08:00:00.000Z';
const channel={id:channelId,family_id:family,channel_type:'custom',visibility:'invite_only',status:'active',updated_at:stamp};
const row={id,family_id:family,channel_id:channelId,auth_user_id:target,role:'member',status:'active',notification_level:'muted',created_at:stamp,updated_at:stamp},own={...row,id:ownId,auth_user_id:actor,role:'owner'};
const body=(r=row,action='promote')=>({action,targetUserId:target,expectedFamilyId:family,expectedActorId:actor,expectedChannelUpdatedAt:stamp,expectedMembershipId:r?.id??null,expectedRole:r?.role??null,expectedStatus:r?.status??null,expectedUpdatedAt:r?.updated_at??null,...(!r?{clientMembershipId:id}:{})});
const options=(extra={})=>{const r=Object.hasOwn(extra,'row')?extra.row:row,input=extra.input??chatMembershipInput(body(r));return {channelId,familyId:family,actorId:actor,input,row:r,targetActive:true,now:Date.parse(stamp)-5,write:async(t,plan)=>[{...(r??{id,family_id:family,channel_id:channelId,auth_user_id:target,notification_level:'all',created_at:t}),role:plan.role,status:plan.status,updated_at:t}],audit:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra};};
test('strict tuple/input validation forbids coercion, unversioned changes, owner assignment and arbitrary fields',()=>{
 for(const patch of [{action:'delete'},{targetUserId:''},{targetUserId:'x\n'},{expectedActorId:null},{expectedFamilyId:'bad'},{expectedUpdatedAt:null},{expectedRole:'admin'},{expectedStatus:'suspended'},{role:'owner'},{notification_level:'all'},{clientMembershipId:id},{expectedChannelUpdatedAt:'2026-02-30T00:00:00Z'}])assert.throws(()=>chatMembershipInput({...body(),...patch}),ChatMembershipError);
 assert.throws(()=>chatMembershipInput(body(null,'promote')));assert.throws(()=>chatMembershipInput({...body(null,'invite'),clientMembershipId:null}));assert.throws(()=>chatMembershipInput({...body(null,'invite'),expectedRole:'member'}));assert.ok(chatMembershipInput(body(null,'invite')));
});
test('only active custom private owner with family management role administers membership',()=>{
 for(const role of ['owner','family_admin','manager'])assert.equal(chatMembershipMayManage(channel,role,own,family,actor),true);
 for(const [c,o,r] of [[channel,null,'owner'],[channel,{...own,role:'moderator'},'owner'],[channel,{...own,status:'left'},'owner'],[channel,own,'member'],[{...channel,status:'archived'},own,'owner'],[{...channel,visibility:'family'},own,'owner'],[{...channel,channel_type:'direct'},own,'owner'],[channel,{...own,auth_user_id:'other'},'owner'],[{...channel,family_id:'other'},own,'owner']])assert.equal(chatMembershipMayManage(c,r,o,family,actor),false);
});
test('owners and self membership cannot be removed, downgraded or reinvited even when left',()=>{
 for(const action of ['invite','remove','promote','demote']){for(const status of ['active','left']){const r={...row,role:'owner',status};assert.throws(()=>chatMembershipPlan(chatMembershipInput(body(r,action)),r,true,actor),e=>e.code==='CHAT_MEMBER_OWNER_PROTECTED');}assert.throws(()=>chatMembershipPlan({...chatMembershipInput(body(row,action)),targetUserId:actor},row,true,actor),e=>e.code==='CHAT_MEMBER_OWNER_PROTECTED');}
});
test('new invite inserts member only, confirms scope/id/time before one audit and projects safe fields',async()=>{
 const input=chatMembershipInput(body(null,'invite')),events=[];
 const r=await chatMembershipWrite(options({row:null,input,write:async(t,plan)=>{events.push('member');return[{...row,notification_level:'all',role:plan.role,status:plan.status,created_at:t,updated_at:t}];},audit:async()=>events.push('audit')}));
 assert.deepEqual(events,['member','audit']);assert.equal(r.member.role,'member');assert.equal(chatMembershipAcknowledged(channelId,input,200,r),true);for(const k of ['family_id','channel_id','auth_user_id'])assert.equal(Object.hasOwn(r.member,k),false);
});
test('promote/demote/remove/reinvite preserve membership id, creation and notification preference',async()=>{
 let current=row;
 for(const action of ['promote','demote','remove','invite']){const input=chatMembershipInput(body(current,action));const r=await chatMembershipWrite(options({row:current,input}));assert.equal(chatMembershipAcknowledged(channelId,input,200,r),true);assert.equal(r.member.id,id);assert.equal(r.member.createdAt,stamp);assert.equal(r.member.notificationLevel,'muted');assert.ok(Date.parse(r.member.updatedAt)>Date.parse(current.updated_at));current={...current,role:r.member.role,status:r.member.status,updated_at:r.member.updatedAt};}
 const left={...row,role:'moderator',status:'left'},input=chatMembershipInput(body(left,'invite'));const r=await chatMembershipWrite(options({row:left,input}));assert.equal(r.member.role,'member');assert.equal(r.member.notificationLevel,'muted');
});
test('active invites/current roles/repeated removal are no-change without write or audit',async()=>{
 let writes=0;for(const [r,action] of [[row,'invite'],[row,'demote'],[{...row,role:'moderator'},'promote'],[{...row,status:'left'},'remove']]){const input=chatMembershipInput(body(r,action)),result=await chatMembershipWrite(options({row:r,input,write:async()=>writes++,audit:async()=>writes++}));assert.equal(result.noChange,true);assert.equal(chatMembershipAcknowledged(channelId,input,200,result),true);}assert.equal(writes,0);
});
test('approved active family targets required; revocation still works for an inactive former family member',async()=>{
 for(const action of ['invite','promote','demote'])await assert.rejects(chatMembershipWrite(options({input:chatMembershipInput(body(row,action)),targetActive:false})),e=>e.code==='CHAT_MEMBER_INELIGIBLE');
 const r=await chatMembershipWrite(options({input:chatMembershipInput(body(row,'remove')),targetActive:false}));assert.equal(r.member.status,'left');
 for(const action of ['promote','demote'])assert.throws(()=>chatMembershipPlan(chatMembershipInput(body({...row,status:'left'},action)),{...row,status:'left'},true,actor),e=>e.code==='CHAT_MEMBER_CHANGED');
});
test('family/actor/target/version changes conflict before write; corrupted scope never reaches audit',async()=>{
 let writes=0;for(const patch of [{expectedFamilyId:'10000000-0000-4000-8000-000000000001'},{expectedActorId:'other'},{expectedRole:'moderator'},{expectedUpdatedAt:'2026-10-12T00:00:00Z'},{expectedMembershipId:ownId}])await assert.rejects(chatMembershipWrite(options({input:{...chatMembershipInput(body()),...patch},write:async()=>writes++})),e=>e.code==='CHAT_MEMBER_CHANGED');assert.equal(writes,0);
 await assert.rejects(chatMembershipWrite(options({row:{...row,channel_id:'other'}})),e=>e.code==='CHAT_MEMBER_UNKNOWN');
});
test('conditional empty/known unique conflict reject; lost or malformed write is unknown with no audit',async()=>{
 let audits=0;for(const [write,code] of [[async()=>[],'CHAT_MEMBER_CHANGED'],[async()=>{throw {status:409};},'CHAT_MEMBER_CHANGED'],[async()=>{throw Error('lost');},'CHAT_MEMBER_UNKNOWN'],[async()=>null,'CHAT_MEMBER_UNKNOWN'],[async()=>[row,row],'CHAT_MEMBER_UNKNOWN']])await assert.rejects(chatMembershipWrite(options({write,audit:async()=>audits++})),e=>e.code===code);assert.equal(audits,0);
 for(const patch of [{id:ownId},{auth_user_id:'spoof'},{family_id:'other'},{role:'owner'},{notification_level:'all'},{created_at:'2026-10-12T00:00:00Z'},{updated_at:'bad'}])await assert.rejects(chatMembershipWrite(options({write:async(t,plan)=>[{...row,role:plan.role,updated_at:t,...patch}],audit:async()=>audits++})),e=>e.code==='CHAT_MEMBER_UNKNOWN');assert.equal(audits,0);
});
test('confirmed audit pending is reviewable 202, never failed save, rollback or blind retry',async()=>{
 const r=await chatMembershipWrite(options({audit:async()=>{throw Error('audit failure');}})),input=chatMembershipInput(body());assert.equal(r.auditPending,true);assert.equal(chatMembershipAcknowledged(channelId,input,202,r),true);assert.equal(chatMembershipAcknowledged(channelId,input,200,r),false);assert.equal(chatMembershipFeedback('/api/chat-channels/'+channelId+'/members',202,r,'en','POST',body()).kind,'info');
});
test('snapshot and acknowledgement validation rejects malformed/cross-target/owner/spoofed data',async()=>{
 const input=chatMembershipInput(body()),r=await chatMembershipWrite(options());for(const patch of [{member:null},{channelId:ownId},{action:'demote'},{success:false},{noChange:true},{member:{...r.member,userId:'other'}},{member:{...r.member,role:'owner'}},{member:{...r.member,family_id:family}}])assert.equal(chatMembershipAcknowledged(channelId,input,200,{...r,...patch}),false);
 const p={familyId:family,actorId:actor,channel:{id:channelId,name:'Private QA',updatedAt:stamp},members:[chatMembershipPublic(own),chatMembershipPublic(row)],eligible:[{userId:target,name:'QA target'}]};assert.ok(chatMembershipSnapshot(p));for(const patch of [{members:[chatMembershipPublic(row)]},{members:[...p.members,chatMembershipPublic(row)]},{eligible:[...p.eligible,...p.eligible]},{eligible:[{userId:actor,name:'Owner'}]},{members:[{...p.members[0],auth_user_id:actor}]}])assert.equal(chatMembershipSnapshot({...p,...patch}),null);
});
test('specific BN/EN confirmation, no-change/success/error/unknown and pending result mapping',async()=>{
 const path='/api/chat-channels/'+channelId+'/members',r=await chatMembershipWrite(options());for(const locale of ['bn','en']){for(const action of ['invite','remove','promote','demote']){const c=chatMembershipActionCopy(path,'POST',{action},locale);assert.ok(c.title&&c.description&&c.confirmLabel);assert.equal(c.destructive,['remove','demote'].includes(action));}assert.equal(chatMembershipFeedback(path,200,r,locale,'POST',body()).kind,'success');assert.equal(chatMembershipFeedback(path,200,{},locale,'POST',body()).kind,'info');assert.equal(chatMembershipFeedback(path,403,{code:'CHAT_MEMBER_OWNER_PROTECTED'},locale,'POST',body()).kind,'error');assert.equal(chatMembershipFeedback(path,503,{},locale,'POST',body()).kind,'info');}assert.equal(chatMembershipActionCopy('/api/chat','POST',{},'en'),null);
});
test('scoped API, role/status/preference CAS, no hard delete, owner gate and cancel/unknown/provider UI wiring',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),route=read('app/api/chat-channels/[id]/members/route.ts'),server=read('lib/chat-membership-server.ts'),ui=read('app/chat/channels/[id]/members/membership-management.tsx'),provider=read('components/action-modal-provider.tsx');
 assert.match(route,/getActiveFamilyMembership/);assert.match(route,/input.expectedActorId !== user.userId/);assert.match(route,/channel.updated_at !== input.expectedChannelUpdatedAt/);assert.match(route,/getOwnedPrivateChat/);assert.match(server,/chatMembershipMayManage/);assert.match(route,/role: `eq\.\$\{input.expectedRole\}`/);assert.match(route,/notification_level: `eq\.\$\{row.notification_level\}`/);assert.match(route,/family_id: `eq\.\$\{membership.family_id\}`/);assert.doesNotMatch(route,/method: "DELETE"/);assert.match(ui,/r.status === 499/);assert.match(ui,/body: JSON.stringify\(body\)/);assert.match(ui,/setUncertain\(input\)/);assert.match(ui,/p.actorId !== input.expectedActorId/);assert.match(ui,/<fieldset disabled=\{loading \|\| busy\}/);assert.match(provider,/chatMembershipActionCopy/);assert.match(provider,/membershipResult/);assert.match(provider,/membershipFailure/);
});
