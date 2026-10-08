import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { noticeExportRows, noticeExportHeaders, noticeWorksheet } from "../lib/notice-export.ts";
const stamp = "2026-10-08T23:45:00.125+00:00";
const fixture = { title_bn: "বাংলা নোটিশ", title_en: "=SUM(1,2)", body_bn: "বাংলা বিবরণ", body_en: "+command",
 category: "general", priority: "normal", status: "draft", is_pinned: false,
 publish_at: null, expires_at: null, created_at: stamp, updated_at: stamp,
 family_id: "secret-family", created_by_user_id: "secret-user", storage_key: "secret-storage", id: "excluded-id" };
const labels = {category:{general:"General"},priority:{normal:"Normal"},status:{draft:"Draft",archived:"Archived"}};
const rows = (values, locale="en") => noticeExportRows(values,locale,labels);
function roundtrip(sheet) {
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Notices");
 return XLSX.read(XLSX.write(book,{type:"buffer",bookType:"xlsx"}),{type:"buffer",cellNF:true}).Sheets.Notices;
}
const parts = cell => {const d=XLSX.SSF.parse_date_code(cell.v);return [d.y,d.m,d.d,d.H,d.M,d.S];};
test("BN/EN empty export keeps established headers plus updated time and timezone",()=>{
 for(const locale of ["bn","en"]) {
  const sheet=roundtrip(noticeWorksheet(XLSX,[],locale,"Asia/Dhaka"));
  assert.deepEqual(XLSX.utils.sheet_to_json(sheet,{header:1}),[[...noticeExportHeaders(locale),locale==="bn"?"সময় অঞ্চল":"Time zone"]]);
  assert.equal(sheet["!autofilter"].ref,"A1:N1");
 }
});
test("explicit projection retains bilingual details/filter order, excludes private identifiers",()=>{
 for(const locale of ["bn","en"]) {
  const projected=rows([fixture,{...fixture,title_bn:"Second",status:"archived",is_pinned:true}],locale);
  assert.deepEqual(Object.keys(projected[0]),noticeExportHeaders(locale));
  assert.doesNotMatch(JSON.stringify(projected),/secret-|excluded-id/);
  const sheet=roundtrip(noticeWorksheet(XLSX,projected,locale,"UTC"));
  assert.equal(sheet.A2.t,"n");assert.equal(sheet.A3.v,2);assert.equal(sheet.B3.v,"Second");
  assert.equal(sheet.D2.v,fixture.body_bn);assert.equal(sheet.E2.v,fixture.body_en);
  assert.equal(sheet.I2.v,locale==="bn"?"না":"No");assert.equal(sheet.I3.v,locale==="bn"?"হ্যাঁ":"Yes");
 }
});
test("native timestamp dates survive Dhaka/UTC/Los Angeles roundtrip, blanks stay blank",()=>{
 for(const locale of ["bn","en"]) for(const [zone,expected] of [["Asia/Dhaka",[2026,10,9,5,45,0]],["UTC",[2026,10,8,23,45,0]],["America/Los_Angeles",[2026,10,8,16,45,0]]]) {
  const sheet=roundtrip(noticeWorksheet(XLSX,rows([fixture],locale),locale,zone));
  for(const key of ["L2","M2"]) {assert.equal(sheet[key].t,"n");assert.deepEqual(parts(sheet[key]),expected);assert.equal(sheet[key].z,"yyyy-mm-dd hh:mm:ss");}
  assert.equal(sheet.J2.v,"");assert.equal(sheet.K2.v,"");assert.equal(sheet.N2.v,zone);
 }
 const leap=roundtrip(noticeWorksheet(XLSX,rows([{...fixture,publish_at:"2024-02-29T16:30:00+06:00",expires_at:"2024-03-01T16:30:00+06:00"}]),"en","Asia/Dhaka"));
 assert.deepEqual(parts(leap.J2),[2024,2,29,16,30,0]);
});
test("1900 January/February serials avoid fictitious leap-day offset",()=>{
 for(const [stamp,serial,expected] of [["1900-01-01T00:00:00Z",1,[1900,1,1,0,0,0]],["1900-02-28T00:00:00Z",59,[1900,2,28,0,0,0]],["1900-03-01T00:00:00Z",61,[1900,3,1,0,0,0]]]) {
  const sheet=roundtrip(noticeWorksheet(XLSX,rows([{...fixture,created_at:stamp}]),"en","UTC"));
  assert.equal(sheet.L2.v,serial);assert.deepEqual(parts(sheet.L2),expected);
 }
});
test("formula-looking input remains literal text and never gets formula metadata",()=>{
 const sheet=roundtrip(noticeWorksheet(XLSX,rows([fixture]),"en","UTC"));
 for(const key of ["C2","E2"]) {assert.equal(sheet[key].t,"s");assert.equal(sheet[key].f,undefined);}
 assert.equal(sheet.C2.v,"=SUM(1,2)");
});
test("malformed/out-of-range dates, text, enums and booleans reject before a workbook is emitted",()=>{
 for(const field of ["publish_at","expires_at","created_at","updated_at"]) for(const bad of [true,"bad","2026-02-30T10:00Z","2026-10-08T10:00","0099-01-01T00:00Z","10000-01-01T00:00Z"]) {
  assert.throws(()=>noticeWorksheet(XLSX,rows([{...fixture,[field]:bad}]),"en","UTC"),/NOTICE_EXPORT_INVALID_DATA/);
 }
 for(const field of ["created_at","updated_at"]) for(const bad of [null,""]) assert.throws(()=>noticeWorksheet(XLSX,rows([{...fixture,[field]:bad}]),"en","UTC"));
 for(const patch of [{title_bn:true},{title_en:"a".repeat(181)},{body_en:{}},{category:"constructor"},{priority:"bad"},{status:"bad"},{is_pinned:"true"}]) assert.throws(()=>rows([{...fixture,...patch}]),/NOTICE_EXPORT_INVALID_DATA/);
 assert.throws(()=>noticeWorksheet(XLSX,[],"en","Invalid/Zone"));
});
test("20,000 authorized synthetic rows preserve full count/order and export wiring",()=>{
 const source=Array.from({length:20000},(_,i)=>({...fixture,title_bn:`QA ${i}`}));
 const sheet=noticeWorksheet(XLSX,rows(source),"en","UTC");
 assert.equal(sheet["!ref"],"A1:N20001");assert.equal(sheet.A20001.v,20000);assert.equal(sheet.B20001.v,"QA 19999");
 const center=readFileSync(new URL("../app/notice-center.tsx",import.meta.url),"utf8");
 assert.ok(center.includes("noticeExportRows(visibleNotices, locale"));assert.ok(center.includes("noticeWorksheet(XLSX, rows, locale"));
 const exportBody=center.slice(center.indexOf("async function exportXlsx()"),center.indexOf("useEffect(() => {",center.indexOf("async function exportXlsx()")));
 assert.ok(exportBody.includes('error.message === "NOTICE_EXPORT_INVALID_DATA"'));assert.ok(!exportBody.includes("dateFormatter.format"));
});
