import assert from "node:assert/strict";
import test from "node:test";
import { magazineCoverWrite, magazineCoverFeedback, magazineWriteFeedback, MagazineCoverOutcomeUnknownError } from "../lib/magazine-cover-write.ts";
const opts=overrides=>({put:async()=>{},create:async()=>({id:"confirmed"}),valid:value=>value?.id==="confirmed",discardUnlinked:async()=>{},confirmedRejected:error=>error?.status===400,cleanupOld:async()=>{},audit:async()=>{},...overrides});
test("successful cover executes put/create/cleanup/audit exactly once in order",async()=>{
 const calls=[];const r=await magazineCoverWrite(opts({put:async()=>calls.push("put"),create:async()=>{calls.push("create");return {id:"confirmed"};},discardUnlinked:async()=>calls.push("discard"),cleanupOld:async()=>calls.push("cleanup"),audit:async()=>calls.push("audit")}));
 assert.deepEqual(calls,["put","create","cleanup","audit"]);assert.equal(r.auditPending,false);assert.equal(r.cleanupPending,false);
});
test("failed object put discards only unlinked object without metadata/audit",async()=>{
 const calls=[];await assert.rejects(magazineCoverWrite(opts({put:async()=>{calls.push("put");throw Error("storage");},discardUnlinked:async()=>calls.push("discard"),create:async()=>calls.push("create"),audit:async()=>calls.push("audit")})),/storage/);assert.deepEqual(calls,["put","discard"]);
});
test("confirmed metadata rejection permits unlinked cleanup but never old-cover cleanup",async()=>{
 let discard=0,cleanup=0,audit=0;const e=Object.assign(new Error("rejected"),{status:400});await assert.rejects(magazineCoverWrite(opts({create:async()=>{throw e;},discardUnlinked:async()=>discard++,cleanupOld:async()=>cleanup++,audit:async()=>audit++})),/rejected/);assert.equal(discard,1);assert.equal(cleanup,0);assert.equal(audit,0);
});
test("unknown/malformed metadata results never delete stored object or retry/reconcile blindly",async()=>{
 for(const create of [async()=>{throw Error("lost response");},async()=>({}),async()=>null]) {
  let attempts=0,discard=0,cleanup=0,audit=0;
  await assert.rejects(magazineCoverWrite(opts({create:async()=>{attempts++;return create();},discardUnlinked:async()=>discard++,cleanupOld:async()=>cleanup++,audit:async()=>audit++})),MagazineCoverOutcomeUnknownError);
  assert.equal(attempts,1);assert.equal(discard,0);assert.equal(cleanup,0);assert.equal(audit,0);
 }
});
test("confirmed-save cleanup and audit failures are independently pending, not failed/retried saves",async()=>{
 for(const [cleanupFails,auditFails] of [[true,false],[false,true],[true,true]]) {
  let creates=0,audits=0,discard=0;
  const r=await magazineCoverWrite(opts({create:async()=>{creates++;return {id:"confirmed"};},cleanupOld:async()=>{if(cleanupFails)throw Error("cleanup");},audit:async()=>{audits++;if(auditFails)throw Error("audit");},discardUnlinked:async()=>discard++}));
  assert.equal(r.cleanupPending,cleanupFails);assert.equal(r.auditPending,auditFails);assert.equal(creates,1);assert.equal(audits,1);assert.equal(discard,0);
 }
});
test("BN/EN pending/unknown states are informational; storage/4xx rejection is not unknown",()=>{
 for(const locale of ["bn","en"]) {
  assert.equal(magazineCoverFeedback(202,{auditPending:true},locale).kind,"info");assert.equal(magazineCoverFeedback(503,{code:"MAGAZINE_COVER_OUTCOME_UNKNOWN",outcomeUnknown:true},locale).kind,"info");
  assert.equal(magazineWriteFeedback("/api/magazine/upload",502,{},locale).kind,"info");assert.equal(magazineWriteFeedback("/api/magazine/records",503,{},locale).kind,"info");
  assert.equal(magazineWriteFeedback("/api/magazine/upload",413,{},locale).kind,"error");
  assert.equal(magazineWriteFeedback("/api/magazine/upload",503,{code:"MAGAZINE_STORAGE_UNAVAILABLE"},locale),null);assert.equal(magazineWriteFeedback("/api/magazine/upload",400,{},locale),null);assert.equal(magazineWriteFeedback("/api/other",503,{},locale),null);
 }
});
