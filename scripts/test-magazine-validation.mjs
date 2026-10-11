import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { magazineObject, magazineUuid, magazineText, magazineChoice, magazineBoolean, magazineTags, magazineArticleFields, magazineCreateStatus, magazineStatusChanges, magazineErrorCopy, MagazineValidationError } from "../lib/magazine-validation.ts";
const fields={title:"QA article",content:"Synthetic article for regression checks only."};
const invalid=(f,code)=>assert.throws(f,e=>e instanceof MagazineValidationError&&e.code===code);
test("objects/UUIDs/action choices reject malformed types and missing required choices",()=>{
 for(const bad of [null,[],true,"bad",0])invalid(()=>magazineObject(bad),"MAGAZINE_INVALID_BODY");
 assert.equal(magazineUuid("70b8713d-6502-4469-887d-4ae3e264a234"),"70b8713d-6502-4469-887d-4ae3e264a234");
 for(const bad of [null,[],true,"x"])invalid(()=>magazineUuid(bad),"MAGAZINE_INVALID_ID");
 for(const bad of [undefined,null,[],"constructor","bad"])invalid(()=>magazineChoice(bad,["published","draft"]),"MAGAZINE_INVALID_OPTION");
 assert.equal(magazineChoice(undefined,["draft"],"draft"),"draft");
});
test("article/comment text trims without truncation and optional summaries stay null",()=>{
 assert.equal(magazineText("  QA  ",180,1),"QA");assert.equal(magazineArticleFields(fields,true).summary,null);
 for(const patch of [{title:""},{title:1},{title:"a".repeat(181)},{content:"a".repeat(19)},{content:"a".repeat(30001)},{summary:"a".repeat(501)},{summary:[]},{category:"bad"},{visibility:"bad"}]) assert.throws(()=>magazineArticleFields({...fields,...patch},true),MagazineValidationError);
 for(const bad of ["","a".repeat(2001),true])invalid(()=>magazineText(bad,2000,1),"MAGAZINE_INVALID_TEXT");
 assert.equal(magazineText("a".repeat(2000),2000,1).length,2000);
});
test("tags deduplicate while overlimit/type inputs reject instead of truncating",()=>{
 assert.deepEqual(magazineTags("heritage, Eid, heritage"),["heritage","Eid"]);assert.deepEqual(magazineTags(undefined),[]);
 for(const bad of [null,[],true,"a".repeat(61),Array.from({length:13},(_,i)=>String(i)).join(",")])invalid(()=>magazineTags(bad),"MAGAZINE_INVALID_TAGS");
});
test("legacy exact boolean strings are supported without truthiness coercion",()=>{
 for(const v of [undefined,false,"false"])assert.equal(magazineBoolean(v),false);
 for(const v of [true,"true"])assert.equal(magazineBoolean(v),true);
 for(const v of [null,[],1,0,"TRUE","yes",""])invalid(()=>magazineBoolean(v),"MAGAZINE_INVALID_OPTION");
 assert.equal(magazineCreateStatus({},false),"pending");assert.equal(magazineCreateStatus({saveDraft:"true"},false),"draft");assert.equal(magazineCreateStatus({publishNow:true},true),"published");
 invalid(()=>magazineCreateStatus({publishNow:true,saveDraft:true},true),"MAGAZINE_INVALID_OPTION");
});
test("private visibility, direct publication and featured management require admin",()=>{
 invalid(()=>magazineArticleFields({...fields,visibility:"admins"},false),"MAGAZINE_ADMIN_ONLY");
 invalid(()=>magazineCreateStatus({publishNow:"true"},false),"MAGAZINE_ADMIN_ONLY");
 invalid(()=>magazineStatusChanges({status:"pending",featured:false},"now",false),"MAGAZINE_ADMIN_ONLY");
});
test("every unpublished transition clears featured; invalid featured/status rejected",()=>{
 for(const status of ["draft","pending","archived"])assert.deepEqual(magazineStatusChanges({status},"now",true),{status,updated_at:"now",featured:false});
 assert.deepEqual(magazineStatusChanges({status:"published",featured:true},"now",true),{status:"published",updated_at:"now",published_at:"now",featured:true});
 invalid(()=>magazineStatusChanges({status:"draft",featured:true},"now",true),"MAGAZINE_INVALID_OPTION");
});
test("bilingual error lookup guards prototype keys and source wiring scopes conditional changes",()=>{
 for(const locale of ["bn","en"])assert.ok(magazineErrorCopy("MAGAZINE_RECORD_CHANGED",locale));assert.equal(magazineErrorCopy("constructor","en"),null);
 const route=readFileSync(new URL("../app/api/magazine/records/route.ts",import.meta.url),"utf8");
 assert.equal((route.match(/await requestObject\(request\)/g)||[]).length,3);
 assert.ok(route.includes('status: `eq.${existing.status}`'));assert.ok(route.includes('updated_at: `eq.${existing.updated_at}`'));assert.ok(route.includes('family_id: `eq.${familyId}`'));
 assert.ok(route.includes('rows.length !== 1 || rows[0].id !== id'));assert.ok(route.includes('if (!comment) return Response.json'));
 assert.ok(route.includes('return await createArticle(data, context)'));assert.ok(route.includes('return await moderateComment(data, context)'));
 const center=readFileSync(new URL("../app/magazine-center.tsx",import.meta.url),"utf8");assert.ok(center.includes("magazineErrorCopy(payload.code, locale)"));
 const modal=readFileSync(new URL("../components/action-modal-provider.tsx",import.meta.url),"utf8");assert.ok(modal.includes("magazineErrorCopy(payload.code, locale)"));
});
