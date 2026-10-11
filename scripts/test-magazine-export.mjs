import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { magazineExportHeaders, magazineExportRows, magazineWorkbook } from "../lib/magazine-export.ts";
const stamp = "2026-10-11T23:45:00.125+00:00";
const article = { id: "10000000-0000-4000-8000-000000000010", title: "=SUM(1,2)", summary: "বাংলা সারাংশ",
  content: "This is a synthetic article only.", category: "story", tags: ["QA", "বাংলা"], status: "published", visibility: "family", featured: false,
  published_at: stamp, created_at: stamp, updated_at: stamp, author_name: "QA Author", reaction_count: 2, comment_count: 1,
  author_user_id: "secret-user", family_id: "secret-family", storage_key: "secret-storage" };
const comment = { id: "10000000-0000-4000-8000-000000000011", article_id: article.id, author_name: "QA Reader", body: "+command", status: "visible", created_at: stamp, author_user_id: "secret-user" };
const media = { id: "10000000-0000-4000-8000-000000000012", article_id: article.id, media_type: "cover", file_name: "@QA cover.png", mime_type: "image/png", file_size: 2048, created_at: stamp, storage_key: "secret-storage", uploaded_by_user_id: "secret-user" };
const build = (a=[article], c=[comment], m=[media], locale="en", zone="UTC") => magazineWorkbook(XLSX,a,c,m,locale,zone);
const roundtrip = book => XLSX.read(XLSX.write(book,{type:"buffer",bookType:"xlsx"}),{type:"buffer",cellNF:true});
const parts = cell => {const d=XLSX.SSF.parse_date_code(cell.v);return [d.y,d.m,d.d,d.H,d.M,d.S];};
test("empty BN/EN retains all three sheets, existing order and timestamp/timezone headers",()=>{
  for(const locale of ["bn","en"]) {
    const book=roundtrip(build([],[],[],locale));
    assert.deepEqual(book.SheetNames,locale==="bn"?["লেখা","মন্তব্য","মিডিয়া তালিকা"]:["Articles","Comments","Media Index"]);
    for(const [i,key] of ["articles","comments","media"].entries()) {
      const sheet=book.Sheets[book.SheetNames[i]];
      assert.deepEqual(XLSX.utils.sheet_to_json(sheet,{header:1}),[[...magazineExportHeaders(key,locale),locale==="bn"?"সময় অঞ্চল":"Time zone"]]);
      assert.equal(sheet["!autofilter"].ref,sheet["!ref"]);
    }
  }
});
test("allowed-field projection preserves body/tags/links/counts and localizes enum labels",()=>{
  for(const locale of ["bn","en"]) {
    const rows=magazineExportRows([article],[comment],[media],locale);
    assert.doesNotMatch(JSON.stringify(rows),/secret-/);
    for(const key of ["articles","comments","media"]) assert.deepEqual(Object.keys(rows[key][0]),magazineExportHeaders(key,locale));
    const book=roundtrip(build(undefined,undefined,undefined,locale)),[a,c,m]=book.SheetNames.map(name=>book.Sheets[name]);
    assert.equal(a.N2.v,article.content);assert.equal(a.E2.v,"QA, বাংলা");assert.equal(a.D2.v,article.summary);
    assert.equal(a.C2.v,locale==="bn"?"পারিবারিক গল্প":"Family story");assert.equal(a.H2.v,locale==="bn"?"পরিবার":"Family");
    assert.equal(a.J2.v,2);assert.equal(a.J2.t,"n");assert.equal(a.J2.z,"#,##0");
    for(const sheet of [c,m]) {assert.equal(sheet.B2.v,article.id);assert.equal(sheet.C2.v,article.title);}
    assert.equal(c.F2.v,locale==="bn"?"দৃশ্যমান":"Visible");assert.equal(m.D2.v,locale==="bn"?"কভার":"Cover");
    assert.equal(m.G2.v,2048);assert.equal(m.G2.t,"n");assert.equal(m.G2.z,"#,##0");
  }
});
test("user text beginning with formula markers stays literal in XLSX roundtrip",()=>{
  const book=roundtrip(build());
  for(const [name,key,value] of [["Articles","B2",article.title],["Comments","E2",comment.body],["Media Index","E2",media.file_name]]) {
    const cell=book.Sheets[name][key];assert.equal(cell.t,"s");assert.equal(cell.v,value);assert.equal(cell.f,undefined);
  }
  for(const sheet of Object.values(book.Sheets)) for(const [key,cell] of Object.entries(sheet)) if(!key.startsWith("!")) assert.equal(cell.f,undefined);
});
test("native datetime across three sheets, Dhaka/UTC/LA and optional unpublished blank",()=>{
  for(const locale of ["bn","en"]) for(const [zone,expected] of [["Asia/Dhaka",[2026,10,12,5,45,0]],["UTC",[2026,10,11,23,45,0]],["America/Los_Angeles",[2026,10,11,16,45,0]]]) {
    const book=roundtrip(build(undefined,undefined,undefined,locale,zone));
    for(const [i,keys,zoneCell] of [[0,["L2","M2","O2"],"P2"],[1,["G2"],"H2"],[2,["H2"],"I2"]]) {
      const sheet=book.Sheets[book.SheetNames[i]];
      for(const key of keys) {assert.equal(sheet[key].t,"n");assert.equal(sheet[key].z,"yyyy-mm-dd hh:mm:ss");assert.deepEqual(parts(sheet[key]),expected);}
      assert.equal(sheet[zoneCell].v,zone);
    }
  }
  const blank=roundtrip(build([{...article,published_at:null,status:"draft"}],[],[]));assert.equal(blank.Sheets.Articles.L2.v,"");
  const leap=roundtrip(build([{...article,created_at:"2024-02-29T16:30:00+06:00"}],[],[],"en","Asia/Dhaka"));assert.deepEqual(parts(leap.Sheets.Articles.M2),[2024,2,29,16,30,0]);
});
test("1900 date boundaries use Excel calendar and reject zone-shifted out-of-range timestamps",()=>{
  for(const [value,serial] of [["1900-01-01T00:00:00Z",1],["1900-02-28T00:00:00Z",59],["1900-03-01T00:00:00Z",61]]) {
    const sheet=roundtrip(build([{...article,created_at:value}],[],[])).Sheets.Articles;assert.equal(sheet.M2.v,serial);
  }
  for(const [stamp,zone] of [["1900-01-01T00:00:00Z","America/Los_Angeles"],["9999-12-31T23:59:59Z","Asia/Dhaka"]]) assert.throws(()=>build([{...article,created_at:stamp}],[],[],"en",zone),/MAGAZINE_EXPORT_INVALID_DATA/);
});
test("malformed dates, numeric coercion, private orphan links and duplicate IDs abort",()=>{
  for(const field of ["created_at","updated_at","published_at"]) for(const bad of [true,"bad","2026-02-30T10:00Z","2026-10-11T10:00","0099-01-01T00:00Z","10000-01-01T00:00Z"]) assert.throws(()=>build([{...article,[field]:bad}],[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  for(const field of ["created_at","updated_at"]) for(const bad of [null,""]) assert.throws(()=>build([{...article,[field]:bad}],[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  for(const patch of [{title:true},{summary:"a".repeat(501)},{content:{}},{category:"constructor"},{visibility:"bad"},{status:"bad"},{featured:"true"},{tags:[{}]},{tags:Array(13).fill("QA")},{reaction_count:"2"},{comment_count:-1},{comment_count:NaN},{reaction_count:1.2}]) assert.throws(()=>build([{...article,...patch}],[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  for(const size of [0,-1,"2048",NaN,Infinity,Number.MAX_SAFE_INTEGER+1,1.5]) assert.throws(()=>build([article],[],[{...media,file_size:size}]),/MAGAZINE_EXPORT_INVALID_DATA/);
  for(const bad of [null,"invalid","2026-02-30T10:00Z"]) {assert.throws(()=>build([article],[{...comment,created_at:bad}],[]),/MAGAZINE_EXPORT_INVALID_DATA/);assert.throws(()=>build([article],[],[{...media,created_at:bad}]),/MAGAZINE_EXPORT_INVALID_DATA/);}
  assert.throws(()=>build([], [comment], []),/MAGAZINE_EXPORT_INVALID_DATA/);assert.throws(()=>build([],[],[media]),/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.throws(()=>build([article,article],[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);assert.throws(()=>build([article],[comment,comment],[]),/MAGAZINE_EXPORT_INVALID_DATA/);assert.throws(()=>build([article],[],[media,media]),/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.throws(()=>build([],[],[],"en","Invalid/Zone"),/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.throws(()=>build(null,[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);assert.throws(()=>build([null],[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.throws(()=>build([{...article,category:["story"]}],[],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.throws(()=>build([article],[{...comment,status:["visible"]}],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.throws(()=>build([article],[{...comment,body:"a".repeat(2001)}],[]),/MAGAZINE_EXPORT_INVALID_DATA/);
  const zero=roundtrip(build([{...article,reaction_count:0,comment_count:0}],[],[]));assert.equal(zero.Sheets.Articles.J2.v,0);assert.equal(zero.Sheets.Articles.K2.v,0);
});
test("20,000 synthetic articles preserve count and order; client writes only validated workbook",()=>{
  const source=Array.from({length:20000},(_,i)=>({...article,id:`10000000-0000-4000-8000-${String(i).padStart(12,"0")}`,title:`QA ${i}`,published_at:null}));
  const book=build(source,[],[]),sheet=book.Sheets.Articles;
  assert.equal(sheet["!ref"],"A1:P20001");assert.equal(sheet.B2.v,"QA 0");assert.equal(sheet.B20001.v,"QA 19999");assert.equal(sheet.P20001.v,"UTC");assert.equal(sheet.O20001.t,"n");
  const client=readFileSync(new URL("../app/magazine-center.tsx",import.meta.url),"utf8");
  assert.match(client,/magazineWorkbook\(XLSX, articles, comments, media, locale, timeZone\)/);
  assert.match(client,/resolvedOptions\(\)\.timeZone/);assert.match(client,/MAGAZINE_EXPORT_INVALID_DATA/);
  assert.ok(client.indexOf("magazineWorkbook(XLSX")<client.indexOf("XLSX.writeFile(book"));
});
