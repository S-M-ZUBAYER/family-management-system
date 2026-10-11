import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { magazineRecordWrite, magazineRecordResponse, magazineRecordAcknowledged, magazineRecordFeedback, readMagazineMutation, MagazineRecordOutcomeUnknownError } from '../lib/magazine-record-write.ts';
import { MagazineValidationError, magazineErrorCopy } from '../lib/magazine-validation.ts';
import { magazineWriteFeedback } from '../lib/magazine-cover-write.ts';
import { saveMagazineWithCover } from '../lib/magazine-save-workflow.ts';
const id='20000000-0000-4000-8000-000000000010', other='20000000-0000-4000-8000-000000000011';
const rejected=e=>e instanceof MagazineValidationError || (e?.status>=400&&e.status<500&&e.status!==408);
const options=patch=>({write:async()=>[{id}],audit:async()=>{},confirmedRejected:rejected,...patch});
const actions=[['POST',{action:'create_article',data:{}},201,{success:true,id,status:'draft'}],['PATCH',{articleId:id},200,{success:true,id}],['DELETE',{kind:'article',recordId:id},200,{success:true,id}],['POST',{action:'set_status',data:{articleId:id,status:'published'}},200,{success:true,id,status:'published'}],['POST',{action:'add_comment',data:{articleId:other}},201,{success:true,id}],['POST',{action:'moderate_comment',data:{commentId:id}},200,{success:true,id}],['POST',{action:'toggle_like',data:{articleId:id}},200,{success:true,id,reacted:false}]];
test('ordinary writes confirm one returned row before one audit without retry',async()=>{
 for(const [method,body,status,payload]of actions){const order=[];const result=await magazineRecordWrite(options({expectedId:id,write:async()=>{order.push('write');return[{id}];},audit:async saved=>{assert.equal(saved,id);order.push('audit');}}));assert.deepEqual(order,['write','audit']);assert.equal(result.auditPending,false);assert.equal(result.cleanupPending,false);const response=magazineRecordResponse(result,payload,status);assert.equal(response.status,status);assert.equal(magazineRecordAcknowledged(method,body,status,await response.json()),true);}
});
test('confirmed audit/cleanup failures return independent pending flags and 202 without rollback/retry',async()=>{
 for(const [auditFail,cleanupFail]of [[true,false],[false,true],[true,true]]){let writes=0,audits=0,cleanups=0;const result=await magazineRecordWrite(options({write:async()=>{writes++;return[{id}];},cleanup:async()=>{cleanups++;if(cleanupFail)throw Error('simulated cleanup');},audit:async()=>{audits++;if(auditFail)throw Error('simulated audit');}}));assert.equal(result.auditPending,auditFail);assert.equal(result.cleanupPending,cleanupFail);assert.deepEqual([writes,audits,cleanups],[1,1,1]);const response=magazineRecordResponse(result);assert.equal(response.status,202);assert.equal((await response.json()).id,id);}
});
test('empty conditional rows conflict; malformed/multiple/wrong/create-empty rows are unknown without audit',async()=>{
 let audits=0;await assert.rejects(magazineRecordWrite(options({expectedId:id,write:async()=>[],audit:async()=>audits++})),e=>e.code==='MAGAZINE_RECORD_CHANGED');
 for(const value of [undefined,null,{},[{}],[{id:'bad'}],[{id:other}],[{id},{id:other}]])await assert.rejects(magazineRecordWrite(options({expectedId:id,write:async()=>value,audit:async()=>audits++})),MagazineRecordOutcomeUnknownError);
 await assert.rejects(magazineRecordWrite(options({write:async()=>[],audit:async()=>audits++})),MagazineRecordOutcomeUnknownError);assert.equal(audits,0);
});
test('known rejection propagates; timeout/server/transport errors are unknown, never retried or audited',async()=>{
 for(const status of [400,401,403,409,422,429,408,500,503]){let writes=0,audits=0;const error=Object.assign(Error('simulated'),{status});await assert.rejects(magazineRecordWrite(options({write:async()=>{writes++;throw error;},audit:async()=>audits++})),e=>status<500&&status!==408?e===error:e instanceof MagazineRecordOutcomeUnknownError);assert.equal(writes,1);assert.equal(audits,0);}
 await assert.rejects(magazineRecordWrite(options({write:async()=>{throw TypeError('lost after commit');}})),MagazineRecordOutcomeUnknownError);
});
test('every client action requires correct identity/status/boolean and definite pending acknowledgement',async()=>{
 for(const [method,body,status,payload]of actions){assert.equal(magazineRecordAcknowledged(method,body,status,payload),true);assert.equal(magazineRecordAcknowledged(method,body,202,{...payload,auditPending:true}),true);
  for(const bad of [null,[],{}, {...payload,success:false},{...payload,id:'bad'},{...payload,outcomeUnknown:true}])assert.equal(magazineRecordAcknowledged(method,body,status,bad),false);
  assert.equal(magazineRecordAcknowledged(method,body,202,payload),false);
  assert.equal(magazineRecordAcknowledged(method,body,status,{...payload,auditPending:true}),false);
  assert.equal(magazineRecordAcknowledged(method,body,status,{...payload,cleanupPending:'false'}),false);
  if(method!=='POST'||!['create_article','add_comment'].includes(body.action))assert.equal(magazineRecordAcknowledged(method,body,status,{...payload,id:other}),false);
  assert.equal((await readMagazineMutation(async()=>Response.json({...payload,auditPending:true},{status:202}),method,body)).kind,'confirmed');}
 assert.equal(magazineRecordAcknowledged('POST',{action:'toggle_like',data:{articleId:id}},200,{success:true,id,reacted:'false'}),false);
 assert.equal(magazineRecordAcknowledged('POST',{action:'set_status',data:{articleId:id,status:'published'}},200,{success:true,id,status:'draft'}),false);
});
test('client cancel/rejection/unknown and malformed 2xx never auto retry or falsely confirm',async()=>{
 for(const [response,kind]of [[new Response('',{status:499}),'cancelled'],[new Response('Forbidden',{status:403}),'rejected'],[new Response('timeout',{status:408}),'unknown'],[Response.json({outcomeUnknown:true},{status:503}),'unknown'],[Response.json({}),'unknown'],[new Response('not JSON'),'unknown'],[Response.json(null),'unknown']]){let count=0;assert.equal((await readMagazineMutation(async()=>{count++;return response;},'PATCH',{articleId:id})).kind,kind);assert.equal(count,1);}
 let count=0;assert.equal((await readMagazineMutation(async()=>{count++;throw Error('lost');},'DELETE',{recordId:id})).kind,'unknown');assert.equal(count,1);
});
test('audit-pending article checkpoints before optional cover; invalid pending cannot checkpoint/upload',async()=>{
 for(const articleId of [null,id])for(const hasCover of [false,true]){const order=[];const result=await saveMagazineWithCover({articleId,hasCover,validateCover:async()=>{},persist:async()=>{order.push('write');return Response.json({success:true,id,status:'draft',auditPending:true},{status:202});},onPersisted:saved=>{assert.equal(saved,id);order.push('checkpoint');},upload:async saved=>{assert.equal(saved,id);order.push('upload');return Response.json({id:other},{status:201});}});assert.equal(result.kind,'record-pending');assert.equal(result.articleAuditPending,true);assert.deepEqual(order,hasCover?['write','checkpoint','upload']:['write','checkpoint']);}
 for(const payload of [{success:true,id,status:'draft'},{success:true,id:other,auditPending:true},null])assert.equal((await saveMagazineWithCover({articleId:id,hasCover:false,validateCover:async()=>{},persist:async()=>Response.json(payload,{status:202}),onPersisted:()=>assert.fail('checkpoint'),upload:async()=>assert.fail('upload')})).kind,'article-unknown');
});
test('BN/EN info feedback includes pending and unknown, malformed success never shows false success',()=>{
 for(const locale of ['bn','en']){assert.equal(magazineRecordFeedback(202,{auditPending:true},locale).kind,'info');assert.equal(magazineRecordFeedback(503,{},locale).message,magazineErrorCopy('MAGAZINE_WRITE_OUTCOME_UNKNOWN',locale));assert.equal(magazineRecordFeedback(200,{},locale),null);assert.equal(magazineRecordFeedback(403,{},locale),null);assert.equal(magazineWriteFeedback('/api/magazine/records',200,{},locale,'PATCH',{articleId:id}).kind,'info');}
});
test('route/client/provider wire all ordinary writes, cleanup warnings and verification locks',()=>{
 const route=readFileSync(new URL('../app/api/magazine/records/route.ts',import.meta.url),'utf8');assert.equal((route.match(/await magazineRecordWrite\(/g)||[]).length,8);assert.equal((route.match(/catch \(error\) \{ return recordError/g)||[]).length,3);assert.ok(route.includes('error.status !== 408'));assert.ok(!route.includes('.delete(item.storage_key).catch'));assert.ok(route.includes('user_id: `eq.${context.userId}`'));
 const client=readFileSync(new URL('../app/magazine-center.tsx',import.meta.url),'utf8');for(const marker of ['readMagazineMutation','setMutationBlocked(true)','setMutationBlocked(false)','if (!(await load())) return;','mutationBlocked || loading','Reload library to verify the outcome','record-pending'])assert.ok(client.includes(marker),marker);
 assert.ok(client.includes('<fieldset disabled={mutationBlocked}'));assert.ok(client.includes('setMutationBlocked(true); setSelectedId(null)'));
 const provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');assert.ok(provider.includes('locale, method, parseBody(init?.body)'));assert.ok(provider.includes('magazineFailure'));assert.ok(provider.includes('throw propagatedError;'));
 assert.ok(provider.includes('value && typeof value === "object" && !Array.isArray(value)'));
});
