import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {ChatFlowError,chatSendInput,chatReactionInput,chatSendWrite,chatReactionWrite,chatFlowResponse,chatFlowAcknowledged,readChatFlow,chatFlowCopy,chatFlowActionCopy,chatFlowFeedback,chatReactionPublic} from '../lib/chat-send-reaction.ts';
const family='20000000-0000-4000-8000-000000000002',channel='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000011',reactionId='20000000-0000-4000-8000-000000000012',other='20000000-0000-4000-8000-000000000013',actor='qa-owner',stamp='2026-10-13T07:00:00Z';
const send={action:'send_message',channelId:channel,body:'QA text',replyToId:null,clientMessageId:id},input=chatSendInput(send);
const message={id,family_id:family,channel_id:channel,auth_user_id:actor,author_name:'QA author',message_type:'text',body:input.body,reply_to_id:null,edited_at:null,created_at:stamp};
const add={action:'toggle_reaction',channelId:channel,messageId:id,emoji:'👍',active:true,expectedReactionId:null},reaction={id:reactionId,family_id:family,message_id:id,auth_user_id:actor,emoji:'👍',created_at:stamp};
const rejected=e=>e?.status>=400&&e.status<500&&e.status!==408;
const sendOpts=(extra={})=>({familyId:family,channelId:channel,actorId:actor,id,authorName:message.author_name,input,readExisting:async()=>[],write:async()=>[message],sync:async()=>{},audit:async()=>{},rejected,collision:e=>e?.status===409,...extra});
const reactOpts=(extra={})=>({familyId:family,channelId:channel,actorId:actor,newId:reactionId,input:chatReactionInput(add),existing:[],write:async()=>[reaction],audit:async()=>{},rejected,...extra});
test('strict send/reaction inputs reject truncation/coercion/spoofing and implicit toggle, normalize IDs',()=>{
 assert.equal(chatSendInput({...send,body:' QA text '}).body,'QA text');assert.equal(chatSendInput({...send,body:'ক'.repeat(5000)}).body.length,5000);
 for(const raw of [null,[],true,{...send,body:''},{...send,body:'x'.repeat(5001)},{...send,replyToId:''},{...send,clientMessageId:null},{...send,auth_user_id:actor},{...send,channelId:'-'.repeat(36)}])assert.throws(()=>chatSendInput(raw),ChatFlowError);
 for(const raw of [null,[],{...add,active:undefined},{...add,active:'true'},{...add,expectedReactionId:undefined},{...add,emoji:'👍x'},{...add,auth_user_id:actor}])assert.throws(()=>chatReactionInput(raw),ChatFlowError);
 assert.equal(chatSendInput({...send,clientMessageId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}).clientMessageId,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});
test('new send confirms exact public row before independent refresh/audit pending, without false rollback',async()=>{
 for(const syncPending of [false,true])for(const auditPending of [false,true]){const order=[],saved=await chatSendWrite(sendOpts({readExisting:async()=>{order.push('read');return[];},write:async()=>{order.push('write');return[message];},sync:async()=>{order.push('sync');if(syncPending)throw Error('simulated');},audit:async()=>{order.push('audit');if(auditPending)throw Error('simulated');}}));
 assert.deepEqual(order,['read','write','sync','audit']);const response=chatFlowResponse(saved),p=await response.json();assert.equal(response.status,syncPending||auditPending?202:201);assert.equal(chatFlowAcknowledged(input,response.status,p),true);for(const k of ['family_id','auth_user_id'])assert.equal(Object.hasOwn(p.message,k),false);}
});
test('matching stable message ID replays the existing row without second write/audit; changed payload cannot rewrite',async()=>{
 const saved=await chatSendWrite(sendOpts({authorName:'Current renamed profile',readExisting:async()=>[message],write:async()=>assert.fail('duplicate write'),audit:async()=>assert.fail('duplicate audit'),sync:async()=>assert.fail('refresh')}));
 assert.equal(saved.replayed,true);assert.equal(saved.verificationPending,true);assert.equal(saved.message.author_name,message.author_name);const r=chatFlowResponse(saved);assert.equal(r.status,202);assert.equal(chatFlowAcknowledged(input,202,await r.json()),true);
 for(const patch of [{body:'changed'},{edited_at:stamp},{family_id:other},{auth_user_id:'another'},{reply_to_id:other}])await assert.rejects(chatSendWrite(sendOpts({readExisting:async()=>[{...message,...patch}],write:async()=>assert.fail('write')})),e=>e.code==='CHAT_FLOW_CHANGED');
 let reads=0,writes=0;const collision=await chatSendWrite(sendOpts({readExisting:async()=>++reads===1?[]:[message],write:async()=>{writes++;throw {status:409};},audit:async()=>assert.fail('audit')}));assert.equal(collision.replayed,true);assert.equal(reads,2);assert.equal(writes,1);
});
test('malformed/wrong-scope/lost send responses never audit or repeat; known rejection remains distinct',async()=>{
 for(const raw of [null,{},[],[{}],[message,message],[{...message,id:other}],[{...message,author_name:'wrong'}],[{...message,channel_id:other}]])await assert.rejects(chatSendWrite(sendOpts({write:async()=>raw,sync:async()=>assert.fail('sync'),audit:async()=>assert.fail('audit')})),e=>e.code==='CHAT_FLOW_UNKNOWN');
 for(const error of [Error('lost'),{status:408},{status:503},{status:400}])await assert.rejects(chatSendWrite(sendOpts({write:async()=>{throw error;},audit:async()=>assert.fail('audit')})),e=>e.code===(error.status===400?'CHAT_FLOW_REJECTED':'CHAT_FLOW_UNKNOWN'));
});
test('explicit reaction add/remove and no-change honor the observed ID and only audit an actual confirmed change',async()=>{
 const inserted=await chatReactionWrite(reactOpts()),r=chatFlowResponse(inserted);assert.equal(r.status,201);assert.equal(chatFlowAcknowledged(chatReactionInput(add),201,await r.json()),true);
 const remove={...add,active:false,expectedReactionId:reactionId},removed=await chatReactionWrite(reactOpts({input:chatReactionInput(remove),existing:[reaction]}));const d=chatFlowResponse(removed);assert.equal(d.status,200);assert.equal(chatFlowAcknowledged(chatReactionInput(remove),200,await d.json()),true);
 for(const active of [false,true]){const body={...add,active,expectedReactionId:active?reactionId:null},noChange=await chatReactionWrite(reactOpts({input:chatReactionInput(body),existing:active?[reaction]:[],write:async()=>assert.fail('no-change write'),audit:async()=>assert.fail('no-change audit')}));assert.equal(noChange.noChange,true);const response=chatFlowResponse(noChange);assert.equal(response.status,200);assert.equal(chatFlowAcknowledged(chatReactionInput(body),200,await response.json()),true);}
 for(const [body,existing] of [[add,[reaction]],[remove,[]]])await assert.rejects(chatReactionWrite(reactOpts({input:chatReactionInput(body),existing,write:async()=>assert.fail('stale write')})),e=>e.code==='CHAT_FLOW_CHANGED');
 const pending=await chatReactionWrite(reactOpts({audit:async()=>{throw Error('simulated');}}));assert.equal(chatFlowResponse(pending).status,202);
});
test('reaction unknown/empty/wrong actor/emoji results do not create phantom audit or reverse state',async()=>{
 for(const raw of [null,{},[],[{}],[reaction,reaction],[{...reaction,auth_user_id:'other'}],[{...reaction,emoji:'❤️'}],[{...reaction,id:other}]])await assert.rejects(chatReactionWrite(reactOpts({write:async()=>raw,audit:async()=>assert.fail('audit')})),e=>e.code===(Array.isArray(raw)&&!raw.length?'CHAT_FLOW_CHANGED':'CHAT_FLOW_UNKNOWN'));
 for(const error of [Error('lost'),{status:408},{status:502},{status:409}])await assert.rejects(chatReactionWrite(reactOpts({write:async()=>{throw error;},audit:async()=>assert.fail('audit')})),e=>e.code===(error.status===409?'CHAT_FLOW_CHANGED':'CHAT_FLOW_UNKNOWN'));
 assert.equal(chatReactionPublic({...reaction,created_at:'bad'}),null);
});
test('typed acknowledgements/cancel/error/pending/unknown bind requested send and desired reaction state',async()=>{
 const saved=await chatFlowResponse(await chatSendWrite(sendOpts())).json();
 for(const raw of [{},{...saved,success:'true'},{...saved,message:{...saved.message,id:other}},{...saved,verificationPending:true},{...saved,outcomeUnknown:true}])assert.equal(chatFlowAcknowledged(input,201,raw),false);
 for(const [status,raw,kind]of [[499,null,'cancelled'],[400,{code:'CHAT_SEND_INPUT'},'rejected'],[409,{code:'CHAT_FLOW_CHANGED'},'rejected'],[408,{},'unknown'],[503,{},'unknown'],[201,{},'unknown'],[201,saved,'confirmed']])assert.equal((await readChatFlow(async()=>Response.json(raw,{status}),input)).kind,kind);
 const react=await chatFlowResponse(await chatReactionWrite(reactOpts())).json();for(const patch of [{active:false},{messageId:other},{emoji:'❤️'},{noChange:true},{reaction:{...react.reaction,is_mine:false}}])assert.equal(chatFlowAcknowledged(chatReactionInput(add),201,{...react,...patch}),false);
 assert.equal((await readChatFlow(async()=>{throw Error('lost');},input)).kind,'unknown');
});
test('bilingual desired-state confirmation and outcome mapping avoid generic retry advice',async()=>{
 const p=await chatFlowResponse(await chatSendWrite(sendOpts())).json();for(const locale of ['bn','en']){for(const code of ['CHAT_SEND_INPUT','CHAT_REACTION_INPUT','CHAT_FLOW_CHANGED','CHAT_FLOW_PENDING','CHAT_FLOW_REJECTED','CHAT_FLOW_UNKNOWN'])assert.ok(chatFlowCopy(code,locale));assert.ok(chatFlowActionCopy('/api/chat','POST',send,locale).description.includes('Cancel/×'));assert.ok(chatFlowActionCopy('/api/chat','POST',{...add,active:false},locale));assert.equal(chatFlowFeedback('/api/chat',201,p,locale,'POST',send),null);assert.equal(chatFlowFeedback('/api/chat',503,{},locale,'POST',send).kind,'info');assert.equal(chatFlowFeedback('/api/chat',409,{code:'CHAT_FLOW_CHANGED'},locale,'POST',add).kind,'error');}
 assert.equal(chatFlowFeedback('/api/chat',503,{},'en','POST',{action:'mark_read'}),null);
});
test('route and UI/provider wiring enforce scope, stable ID, desired reaction and synchronous guard/verification',()=>{
 const route=readFileSync(new URL('../app/api/chat/route.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/family-chat.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 for(const t of ['chatSendInput(body)','chatReactionInput(body)','chatSendWrite','chatReactionWrite','clientMessageId??crypto.randomUUID()','return=representation','auth_user_id:`eq.${user.userId}`','chat_message_sent','chat_reaction_added','chat_reaction_removed'])assert.ok(route.includes(t),t);
 for(const t of ['const sendRequest=useRef','JSON.stringify([channelId,input.body])','clientMessageId:sendRequest.current.id','setVerifyKind("send")','setVerifyKind("reaction")','expectedReactionId:existing?.id??null','active:!existing','if(response.status===499)','outcome.kind==="cancelled"'])assert.ok(ui.includes(t),t);
 assert.ok(provider.includes('chatFlowActionCopy(pathname,method,body,locale)'));assert.ok(provider.includes('flowResult ??'));assert.ok(provider.includes('flowFailure ??'));
 const ast=ts.createSourceFile('family-chat.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='FamilyChat');assert.ok(component?.body);
 assert.equal(ast.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='toggleReaction').length,0);
 for(const name of ['sendMessage','toggleReaction'])assert.equal(component.body.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name).length,1);
});
