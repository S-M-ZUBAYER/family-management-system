import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { magazineCoverMaxBytes, magazineCoverMetadata, magazineCoverHeaderMatches, validateMagazineCover } from "../lib/magazine-cover-policy.ts";
import { magazineErrorCopy } from "../lib/magazine-validation.ts";
import { saveMagazineWithCover } from "../lib/magazine-save-workflow.ts";
const articleId="10000000-0000-4000-8000-000000000010",mediaId="10000000-0000-4000-8000-000000000011";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=","base64");
const json=(payload,status=200)=>Response.json(payload,{status});
const opts=overrides=>({articleId:null,hasCover:true,validateCover:async()=>{},persist:async()=>json({id:articleId},201),upload:async()=>json({id:mediaId},201),onPersisted:()=>{},...overrides});
test("cover metadata bounds, extension/type/name checks and canonical suffix",()=>{
 assert.equal(magazineCoverMetadata({name:"ছবি.JPEG",type:"image/jpeg",size:1}).extension,"jpg");
 assert.equal(magazineCoverMetadata({name:"blob",type:"image/png",size:magazineCoverMaxBytes}).extension,"png");
 for(const patch of [{name:""},{name:"a".repeat(221)},{name:"../file.png"},{name:"x\\file.png"},{name:"x\0.png"},{name:"x.exe"},{type:"image/svg+xml"},{type:"constructor"},{size:0},{size:-1},{size:Infinity},{size:1.5},{size:"1"},{size:magazineCoverMaxBytes+1}]) assert.throws(()=>magazineCoverMetadata({name:"cover.png",type:"image/png",size:png.length,...patch}),/MAGAZINE_INVALID_COVER/);
});
test("bounded image headers reject MIME spoofing, bad dimensions and WebP length mismatch",async()=>{
 assert.equal(magazineCoverHeaderMatches("image/png",png.subarray(0,32),png.length),true);
 assert.equal(magazineCoverHeaderMatches("image/jpeg",Uint8Array.from([255,216,255,224]),4),true);
 assert.equal(magazineCoverHeaderMatches("image/gif",Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00"),13),true);
 const webp=Buffer.alloc(20);webp.write("RIFF");webp.writeUInt32LE(12,4);webp.write("WEBPVP8 ",8);
 assert.equal(magazineCoverHeaderMatches("image/webp",webp,20),true);assert.equal(magazineCoverHeaderMatches("image/webp",webp,21),false);
 for(const type of ["image/png","image/jpeg","image/gif","image/webp","image/svg+xml"]) assert.equal(magazineCoverHeaderMatches(type,Buffer.from("<script>alert(1)</script>"),24),false);
 const zero=Buffer.from(png);zero.fill(0,16,20);assert.equal(magazineCoverHeaderMatches("image/png",zero,png.length),false);
 await validateMagazineCover(new File([png],"cover.png",{type:"image/png"}));
 await assert.rejects(validateMagazineCover(new File(["not a PNG"],"cover.png",{type:"image/png"})),/MAGAZINE_INVALID_COVER/);
});
test("invalid file is rejected before article persistence; article cancellation never uploads",async()=>{
 let writes=0,uploads=0,checkpoints=0;
 await assert.rejects(saveMagazineWithCover(opts({validateCover:async()=>{throw Error("invalid file");},persist:async()=>{writes++;},upload:async()=>{uploads++;}})),/invalid file/);
 assert.equal(writes,0);assert.equal(uploads,0);
 const result=await saveMagazineWithCover(opts({persist:async()=>json({error:"cancel"},499),upload:async()=>{uploads++;},onPersisted:()=>checkpoints++}));
 assert.equal(result.kind,"cancelled");assert.equal(uploads,0);assert.equal(checkpoints,0);
});
test("confirmed article ID is checkpointed before upload failure/cancel; next attempt edits same ID",async()=>{
 for(const response of [json({error:"denied"},400),json({error:"cancel"},499)]) {
  let savedId=null,createCount=0;const calls=[];
  const first=await saveMagazineWithCover(opts({persist:async id=>{assert.equal(id,null);createCount++;return json({id:articleId},201);},onPersisted:id=>{savedId=id;calls.push("checkpoint");},upload:async id=>{assert.equal(id,savedId);calls.push("upload");return response;}}));
  assert.ok(["cover-failed","cover-cancelled"].includes(first.kind));assert.equal(first.articleId,articleId);assert.deepEqual(calls,["checkpoint","upload"]);
  const retry=await saveMagazineWithCover(opts({articleId:savedId,persist:async id=>{assert.equal(id,articleId);return json({success:true});}}));
  assert.equal(retry.kind,"saved");assert.equal(createCount,1);
 }
});
test("record/upload lost responses and malformed acknowledgements require verification, not retries",async()=>{
 for(const persist of [async()=>{throw Error("lost");},async()=>json({error:"audit failed"},502),async()=>json({},201),async()=>new Response("not json",{status:201}),async()=>json({id:articleId},200)]) {
  let uploads=0,checkpoint=0;const r=await saveMagazineWithCover(opts({persist,upload:async()=>{uploads++;},onPersisted:()=>checkpoint++}));assert.equal(r.kind,"article-unknown");assert.equal(uploads,0);assert.equal(checkpoint,0);
 }
 const malformedEdit=await saveMagazineWithCover(opts({articleId,persist:async()=>json({})}));assert.equal(malformedEdit.kind,"article-unknown");
 for(const upload of [async()=>{throw Error("lost");},async()=>json({code:"MAGAZINE_COVER_OUTCOME_UNKNOWN",outcomeUnknown:true},503),async()=>json({},201),async()=>json({id:mediaId},202),async()=>json({id:mediaId},200)]) {
  let checkpoint=null;const r=await saveMagazineWithCover(opts({upload,onPersisted:id=>{checkpoint=id;}}));assert.equal(r.kind,"cover-unknown");assert.equal(checkpoint,articleId);
 }
});
test("confirmed cover with audit/cleanup pending stays saved; missing storage allows explicit file removal",async()=>{
 const pending=await saveMagazineWithCover(opts({upload:async()=>json({id:mediaId,auditPending:true,cleanupPending:false},202)}));assert.equal(pending.kind,"cover-pending");assert.equal(pending.articleId,articleId);
 const absent=await saveMagazineWithCover(opts({upload:async()=>json({code:"MAGAZINE_STORAGE_UNAVAILABLE"},503)}));assert.equal(absent.kind,"cover-failed");
 let uploads=0;const without=await saveMagazineWithCover(opts({hasCover:false,upload:async()=>{uploads++;}}));assert.equal(without.kind,"saved");assert.equal(uploads,0);
 const tooLarge=await saveMagazineWithCover(opts({upload:async()=>new Response("Payload Too Large",{status:413})}));assert.equal(tooLarge.kind,"cover-failed");assert.equal(tooLarge.payload.code,"MAGAZINE_INVALID_COVER");assert.equal(tooLarge.articleId,articleId);
 const denied=await saveMagazineWithCover(opts({persist:async()=>new Response("Forbidden",{status:403})}));assert.equal(denied.kind,"article-failed");
});
test("localized errors, blocked save/reload/remove-file UI, closeable explicit modal and route wiring",()=>{
 for(const locale of ["bn","en"])for(const code of ["MAGAZINE_INVALID_COVER","MAGAZINE_STORAGE_UNAVAILABLE"])assert.ok(magazineErrorCopy(code,locale));
 const client=readFileSync(new URL("../app/magazine-center.tsx",import.meta.url),"utf8");
 for(const text of ["saveMagazineWithCover","editorArticle.current = articleId; setEditingId(articleId)","Boolean(saveBlocked)","checkSavedArticle","validateMagazineCover(coverFile)","Remove selected file","if (saving) return;","useActionResult"])assert.ok(client.includes(text),text);
 for(const text of ["md:grid-cols-[minmax(0,1fr)_250px]", "[&>*]:min-w-0", "max-w-full break-all", "sr-only h-px w-px", "relative flex min-h-32"])assert.ok(client.includes(text),text);
 const server=readFileSync(new URL("../app/api/magazine/upload/route.ts",import.meta.url),"utf8");
 assert.ok(server.includes("validateMagazineCover(file)"));assert.ok(server.includes("magazineCoverWrite"));assert.ok(server.includes("return=representation"));assert.ok(server.includes("in.(${batch.map"));assert.ok(!server.includes("neq.${created.id}"));
 const modal=readFileSync(new URL("../components/action-modal-provider.tsx",import.meta.url),"utf8");assert.ok(modal.includes("magazineWriteFeedback(url.pathname"));assert.ok(modal.includes("new CustomEvent<ResultState>"));
});
