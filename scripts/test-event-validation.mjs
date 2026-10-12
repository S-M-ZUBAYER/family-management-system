import assert from 'node:assert/strict';
import test from 'node:test';
import { eventRecord,eventMoney,eventCapacity,eventTimestamp,eventUuid,eventErrorCopy,EventValidationError } from '../lib/event-validation.ts';
const form={titleBn:'QA event',descriptionBn:'Synthetic event details only.',venue:'QA location',startAt:'2027-02-28T12:00:00+06:00'};
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof EventValidationError&&e.code===code);
test('create defaults to draft/zero/null; edit requires explicit status and preserves each allowed state',()=>{
 const r=eventRecord(form);assert.equal(r.status,'draft');assert.equal(r.estimated_cost_per_person,0);assert.equal(r.capacity,null);
 for(const status of ['draft','published','registration_closed','completed','cancelled'])assert.equal(eventRecord({...form,status},true).status,status);
 reject(()=>eventRecord(form,true),'EVENT_INVALID_OPTION');for(const status of ['completed','cancelled'])reject(()=>eventRecord({...form,status}),'EVENT_INVALID_OPTION');
});
test('body/text validation rejects primitives, truncation and coerced optional fields',()=>{
 for(const value of [null,[],true,'bad'])reject(()=>eventRecord(value),'EVENT_INVALID_BODY');
 for(const [key,value]of [['titleBn','ab'],['titleBn','x'.repeat(181)],['descriptionBn','abcd'],['descriptionEn',true],['venue',''],['city',[]],['meetingPoint','x'.repeat(221)]])reject(()=>eventRecord({...form,[key]:value}),'EVENT_INVALID_TEXT');
 assert.equal(eventRecord({...form,titleBn:'  QA event  ',titleEn:' '}).title_bn,'QA event');assert.equal(eventRecord({...form,titleEn:' '}).title_en,null);
});
test('options are exact enums rather than coerced values or prototype keys',()=>{
 for(const key of ['eventType','status'])for(const value of [null,true,[],{},['draft'],'constructor','__proto__'])reject(()=>eventRecord({...form,[key]:value}),'EVENT_INVALID_OPTION');
});
test('money respects numeric(14,2) exact cents, nonnegative bounds and no boolean/array coercion',()=>{
 assert.equal(eventMoney('12.25'),12.25);assert.equal(eventMoney(0),0);assert.equal(eventMoney('999999999999.99'),999999999999.99);assert.equal(eventMoney(''),0);
 for(const value of [true,[],{},NaN,Infinity,-1,'1.001',1.005,'1e3','1000000000000','-0.01'])reject(()=>eventMoney(value),'EVENT_INVALID_MONEY');
});
test('capacity is an integer from 1 to 10000 or absent; database rounding is never relied on',()=>{
 for(const value of [1,'12',10000])assert.equal(eventCapacity(value),Number(value));for(const value of [undefined,null,''])assert.equal(eventCapacity(value),null);
 for(const value of [true,[],{},0,-1,1.5,'1.0',10001,'1e2'])reject(()=>eventCapacity(value),'EVENT_INVALID_CAPACITY');
});
test('timestamps use actual calendar and timezone; end respects schema ordering including equal times',()=>{
 assert.equal(eventTimestamp('2024-02-29T12:30:00+06:00'),'2024-02-29T06:30:00.000Z');assert.equal(eventTimestamp(null),null);
 for(const value of [true,[],{},'2027-02-29T12:00Z','2026-02-30T12:00Z','2026-10-12T25:00Z','2026-10-12T12:00'])reject(()=>eventTimestamp(value),'EVENT_INVALID_DATE');
 reject(()=>eventTimestamp(null,true),'EVENT_INVALID_DATE');reject(()=>eventRecord({...form,endAt:'2020-01-01T00:00Z'}),'EVENT_INVALID_SCHEDULE');assert.equal(eventRecord({...form,endAt:form.startAt}).start_at,eventRecord({...form,endAt:form.startAt}).end_at);
  reject(()=>eventTimestamp('9999-12-31T23:59:59-01:00'),'EVENT_INVALID_DATE');
});
test('IDs and bilingual error copy fail closed for unknown/prototype keys',()=>{
 assert.equal(eventUuid('20000000-0000-4000-8000-000000000010'),true);assert.equal(eventUuid('bad'),false);
 for(const locale of ['bn','en'])for(const code of ['EVENT_INVALID_MONEY','EVENT_INVALID_DATE','EVENT_INVALID_CAPACITY','EVENT_RECORD_CHANGED','EVENT_WRITE_PENDING','EVENT_WRITE_OUTCOME_UNKNOWN'])assert.ok(eventErrorCopy(code,locale));assert.equal(eventErrorCopy('constructor','en'),null);
});
