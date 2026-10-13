import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import ts from 'typescript';
import {ChatSetupError,chatCreateInput,chatChannelPublic,chatCreateWrite,chatPreferenceInput,chatPreferenceWrite,chatSetupResponse,chatSetupAcknowledged,readChatSetup,chatSetupCopy,chatSetupActionCopy,chatSetupFeedback,chatSetupVerification,chatPreferenceAllowsNotification} from '../lib/chat-setup-workflow.ts';
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000010',memberId='20000000-0000-4000-8000-000000000011',other='20000000-0000-4000-8000-000000000012',actor='qa-owner',stamp='2026-10-13T08:00:00Z',next='2026-10-13T08:01:00.000Z';
const input=chatCreateInput({action:'create_channel',channelType:'custom',name:'QA channel',description:'QA description',visibility:'invite_only',memberIds:[],clientChannelId:id});
const channel={id,family_id:family,name:input.name,description:input.description,channel_type:input.channelType,visibility:input.visibility,direct_key:null,status:'active',created_by_user_id:actor,created_at:stamp,updated_at:stamp};
const member={id:memberId,family_id:family,channel_id:id,auth_user_id:actor,role:'owner',status:'active',notification_level:'all',created_at:stamp,updated_at:stamp};
const rejected=e=>e?.status>=400&&e.status<500&&e.status!==408;
const createOpts=(extra={})=>({id,familyId:family,actorId:actor,name:input.name,description:input.description,channelType:input.channelType,visibility:input.visibility,directKey:null,memberIds:[actor],readExisting:async()=>[],write:async()=>[channel],readMembers:async()=>[member],writeMembers:async()=>[member],audit:async()=>{},collision:e=>e?.status===409,rejected,...extra});
const pref=chatPreferenceInput({action:'update_notification',channelId:id,level:'muted',expectedLevel:'all',expectedMembershipId:memberId,expectedUpdatedAt:stamp});
const prefOpts=(extra={})=>({familyId:family,actorId:actor,input:pref,existing:[member],newId:other,now:Date.parse(next),write:async(row,updatedAt)=>[{...row,notification_level:pref.level,updated_at:updatedAt}],audit:async()=>{},rejected,...extra});
test('strict create/preference inputs reject coercion, truncation, duplicate/unknown IDs and missing versions',()=>{
 for(const patch of [{name:''},{name:'x'.repeat(101)},{description:'x'.repeat(501)},{memberIds:['x','x']},{memberIds:[null]},{clientChannelId:'bad'},{family_id:family},{visibility:'admins'}])assert.throws(()=>chatCreateInput({...input,...patch}),ChatSetupError);
 assert.equal(chatCreateInput({...input,channelType:'admin',visibility:'family'}).visibility,'admins');assert.equal(chatCreateInput({...input,channelType:'direct',name:''}).visibility,'invite_only');
 for(const patch of [{level:'loud'},{expectedLevel:true},{expectedMembershipId:null},{expectedUpdatedAt:undefined},{role:'owner'}])assert.throws(()=>chatPreferenceInput({...pref,...patch}),ChatSetupError);
});
test('new private channel confirms parent and exact active own member before one audit/public acknowledgement',async()=>{
 const order=[],result=await chatCreateWrite(createOpts({readExisting:async()=>{order.push('read');return[];},write:async()=>{order.push('parent');return[channel];},writeMembers:async()=>{order.push('members');return[member];},audit:async()=>order.push('audit')}));assert.deepEqual(order,['read','parent','members','audit']);
 const r=chatSetupResponse(result),p=await r.json();assert.equal(r.status,201);assert.equal(chatSetupAcknowledged(input,actor,201,p),true);for(const k of ['family_id','created_by_user_id','direct_key'])assert.equal(Object.hasOwn(p.channel,k),false);
 assert.ok(chatChannelPublic(channel));assert.equal(chatChannelPublic({...channel,created_at:'bad'}),null);
 const pending=await chatCreateWrite(createOpts({audit:async()=>{throw Error('simulated');}}));assert.equal(chatSetupResponse(pending).status,202);
});
test('family/admin creation skips member insertion; direct reuse requires exact authorized participants',async()=>{
 for(const channelType of ['custom','admin']){const visibility=channelType==='admin'?'admins':'family',row={...channel,channel_type:channelType,visibility};const saved=await chatCreateWrite(createOpts({channelType,visibility,memberIds:[],write:async()=>[row],writeMembers:async()=>assert.fail('unneeded members')}));assert.equal(saved.channel.visibility,visibility);}
 const direct={...channel,channel_type:'direct',direct_key:'qa-other:qa-owner',created_by_user_id:'qa-other',name:'Original partner label'},otherMember={...member,id:other,auth_user_id:'qa-other',role:'owner'};
 const reused=await chatCreateWrite(createOpts({channelType:'direct',directKey:direct.direct_key,memberIds:['qa-other',actor],readExisting:async()=>[direct],readMembers:async()=>[{...member,role:'member'},otherMember],write:async()=>assert.fail('duplicate direct'),audit:async()=>assert.fail('duplicate audit')}));assert.equal(reused.existing,true);assert.equal(chatSetupResponse(reused).status,202);
});
test('saved ID replays without duplicate writes; lost parent/member replies retain parent and never compensate',async()=>{
 const replay=await chatCreateWrite(createOpts({readExisting:async()=>[channel],write:async()=>assert.fail('duplicate'),writeMembers:async()=>assert.fail('member replay'),audit:async()=>assert.fail('audit replay')}));assert.equal(replay.verificationPending,true);
 for(const raw of [null,{},[],[{}],[{...channel,family_id:other}],[{...channel,created_by_user_id:'other'}]])await assert.rejects(chatCreateWrite(createOpts({write:async()=>raw,writeMembers:async()=>assert.fail('members'),audit:async()=>assert.fail('audit')})),e=>e.code==='CHAT_SETUP_UNKNOWN');
 for(const rows of [null,[],[{}],[{...member,role:'member'}],[{...member,notification_level:'muted'}]])await assert.rejects(chatCreateWrite(createOpts({writeMembers:async()=>rows,audit:async()=>assert.fail('audit')})),e=>e.code==='CHAT_CHANNEL_SETUP_PENDING'&&e.channelId===id);
 for(const error of [Error('lost'),{status:409},{status:503}])await assert.rejects(chatCreateWrite(createOpts({writeMembers:async()=>{throw error;}})),e=>e.code==='CHAT_CHANNEL_SETUP_PENDING');
 let reads=0;const collision=await chatCreateWrite(createOpts({readExisting:async()=>++reads===1?[]:[channel],write:async()=>{throw {status:409};},audit:async()=>assert.fail('replay audit')}));assert.equal(collision.existing,true);
});
test('preferences preserve owner role/status/time and return independent pending/no-change/default semantics',async()=>{
 const changed=await chatPreferenceWrite(prefOpts());const r=chatSetupResponse(changed);assert.equal(r.status,200);assert.equal(chatSetupAcknowledged(pref,actor,200,await r.json()),true);assert.ok(Date.parse(changed.preference.updatedAt)>Date.parse(stamp));
 const noChangeInput={...pref,level:'all'},noChange=await chatPreferenceWrite(prefOpts({input:noChangeInput,write:async()=>assert.fail('no-change write'),audit:async()=>assert.fail('no-change audit')}));assert.equal(noChange.noChange,true);
 const defaults={...noChangeInput,expectedMembershipId:null,expectedUpdatedAt:null},fallback=await chatPreferenceWrite(prefOpts({input:defaults,existing:[],write:async()=>assert.fail('default write')}));assert.deepEqual(fallback.preference,{level:'all',membershipId:null,updatedAt:null});
 const insertInput={...pref,expectedMembershipId:null,expectedUpdatedAt:null},inserted=await chatPreferenceWrite(prefOpts({input:insertInput,existing:[],write:async(_row,updatedAt)=>[{...member,id:other,role:'member',notification_level:'muted',updated_at:updatedAt}]}));assert.equal(inserted.preference.membershipId,other);
 assert.equal(chatSetupResponse(await chatPreferenceWrite(prefOpts({audit:async()=>{throw Error('simulated');}}))).status,202);
});
test('stale/left/changed-version preferences reject; lost/wrong-row writes never audit or replay',async()=>{
 for(const row of [{...member,status:'left'},{...member,notification_level:'muted'},{...member,updated_at:next}])await assert.rejects(chatPreferenceWrite(prefOpts({existing:[row],write:async()=>assert.fail('stale write')})),e=>e.code==='CHAT_SETUP_CHANGED');
 for(const rows of [null,{},[],[{}],[{...member,notification_level:'muted',updated_at:next,role:'member'}],[{...member,notification_level:'muted',updated_at:next,auth_user_id:'other'}]])await assert.rejects(chatPreferenceWrite(prefOpts({write:async()=>rows,audit:async()=>assert.fail('audit')})),e=>e.code===(Array.isArray(rows)&&!rows.length?'CHAT_SETUP_CHANGED':'CHAT_SETUP_UNKNOWN'));
 for(const error of [Error('lost'),{status:408},{status:502},{status:409}])await assert.rejects(chatPreferenceWrite(prefOpts({write:async()=>{throw error;},audit:async()=>assert.fail('audit')})),e=>e.code===(error.status===409?'CHAT_SETUP_CHANGED':'CHAT_SETUP_UNKNOWN'));
});
test('typed ack/cancel/known/unknown/pending and bilingual modal mapping validate actor/input',async()=>{
 const p=await chatSetupResponse(await chatCreateWrite(createOpts())).json();for(const raw of [{},{...p,channelId:other},{...p,memberIds:['wrong']},{...p,existing:'true'},{...p,verificationPending:true},{...p,outcomeUnknown:true}])assert.equal(chatSetupAcknowledged(input,actor,201,raw),false);
 for(const [status,raw,kind]of [[499,null,'cancelled'],[400,{code:'CHAT_CHANNEL_INPUT'},'rejected'],[409,{code:'CHAT_SETUP_CHANGED'},'rejected'],[503,{},'unknown'],[201,{},'unknown'],[201,p,'confirmed']])assert.equal((await readChatSetup(async()=>Response.json(raw,{status}),input,actor)).kind,kind);
 assert.equal((await readChatSetup(async()=>{throw Error('lost');},input,actor)).kind,'unknown');
 for(const locale of ['bn','en']){for(const code of ['CHAT_CHANNEL_INPUT','CHAT_PREFERENCE_INPUT','CHAT_SETUP_CHANGED','CHAT_SETUP_REJECTED','CHAT_SETUP_PENDING','CHAT_SETUP_UNKNOWN'])assert.ok(chatSetupCopy(code,locale));assert.ok(chatSetupActionCopy('/api/chat','POST',input,locale).description.includes('Cancel/×'));assert.equal(chatSetupFeedback('/api/chat',201,p,locale,'POST',input,actor),null);assert.equal(chatSetupFeedback('/api/chat',503,{},locale,'POST',input,actor).kind,'info');}
});
test('verification requires matching family/actor/accessible target/private participant set; migration/missing setup cannot unlock',()=>{
 const c={id,name:input.name,description:input.description,channelType:'custom',visibility:'invite_only',memberIds:[actor],notificationLevel:'all',ownPreference:{membershipId:memberId,updatedAt:stamp}},meta={family:{id:family},viewer:{authUserId:actor},migrationRequired:false,channels:[c]};
 assert.equal(chatSetupVerification(meta,family,actor,input,id),id);assert.equal(chatSetupVerification(meta,family,actor,pref,id),id);
 for(const raw of [{...meta,family:{id:other}},{...meta,viewer:{authUserId:'other'}},{...meta,migrationRequired:true},{...meta,channels:[]},{...meta,channels:[{...c,memberIds:[]}]},{...meta,channels:[{...c,name:'changed'}]}])assert.equal(chatSetupVerification(raw,family,actor,input,id),null);
});
test('notification policy honors muted/all and literal display-name mentions, not background push claims',()=>{
 assert.equal(chatPreferenceAllowsNotification('all',null,'QA'),true);assert.equal(chatPreferenceAllowsNotification('muted','@[QA]','QA'),false);assert.equal(chatPreferenceAllowsNotification('mentions','hello @[QA]','QA'),true);assert.equal(chatPreferenceAllowsNotification('mentions','hello @QA','QA'),false);assert.equal(chatPreferenceAllowsNotification('mentions','@[other]','QA'),false);assert.equal(chatPreferenceAllowsNotification('mentions','@[QA]',''),false);assert.equal(chatPreferenceAllowsNotification('bad','@[QA]','QA'),false);
});
test('route/component/provider wiring removes destructive rollback and keeps scoped guarded setup, preferences and alerts',()=>{
 const route=readFileSync(new URL('../app/api/chat/route.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/family-chat.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 assert.ok(!route.includes('rollbackFamilyId'));assert.ok(!route.includes('createdChannelId'));for(const t of ['chatCreateInput(body)','chatCreateWrite','chatPreferenceWrite','ownPreference:','return=representation','auth_user_id:`eq.${user.userId}`','notification_level:`eq.${row.notification_level}`','updated_at:`eq.${row.updated_at}`','chat_notification_changed'])assert.ok(route.includes(t),t);
 for(const t of ['readChatSetup','const createRequest=useRef','setVerifyWorkspace','chatSetupVerification','if(response.status===499)','chatPreferenceAllowsNotification','notificationSettings.current','X-Fms-Chat-Actor'])assert.ok(ui.includes(t),t);
 assert.ok(ui.includes('<fieldset disabled={working} aria-busy={working} className="contents">'));
 assert.ok(!route.includes('X-Fms-Chat-Actor'));assert.ok(provider.includes('chatSetupActionCopy'));assert.ok(provider.includes('setupResult ??'));
 const ast=ts.createSourceFile('family-chat.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='FamilyChat');for(const name of ['createChannel','updateNotification','verifySetupOutcome'])assert.equal(component.body.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name).length,1);
});
