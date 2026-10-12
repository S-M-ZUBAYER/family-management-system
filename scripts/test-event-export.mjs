import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {eventWorkbook,eventExportRows,eventExportHeaders,eventWorksheet} from '../lib/event-export.ts';
import {eventErrorCopy} from '../lib/event-validation.ts';
const uuid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stamp='2026-10-12T23:45:00.125Z',id=uuid(10);
const event={id,title_bn:'পারিবারিক মিলনমেলা',title_en:'Family reunion',description_bn:'বাংলা বিবরণ',description_en:'English description',event_type:'reunion',start_at:stamp,end_at:null,venue:'QA Hall',city:'Dhaka',meeting_point:null,estimated_cost_per_person:'1.25',total_budget:'10.50',capacity:12,registration_deadline:null,status:'published',created_at:stamp,updated_at:stamp};
const rsvp={id:uuid(11),event_id:id,is_current_user:true,respondent_name:'QA member',response:'going',guest_count:2,note:'QA note',updated_at:stamp};
const comment={id:uuid(12),event_id:id,author_name:'QA member',body:'QA comment',created_at:stamp};
const media={id:uuid(13),event_id:id,file_name:'QA.png',mime_type:'image/png',file_size:68,caption:'QA caption',uploader_name:'QA member',created_at:stamp};
const snapshot=()=>({family:{id:uuid(2),name_bn:'পরীক্ষা পরিবার',name_en:'QA family'},events:[structuredClone(event)],rsvps:[structuredClone(rsvp)],comments:[structuredClone(comment)],media:[structuredClone(media)],permissions:{canManage:true},migrationRequired:false});
const keys=['events','rsvps','comments','media'];
const sheetNames=locale=>locale==='bn'?['ইভেন্ট','RSVPs','আলোচনা','মিডিয়া']:['Events','RSVPs','Discussion','Media'];
function roundtrip(p=snapshot(),ids=p.events.map(e=>e.id),locale='en',zone='UTC'){
 const book=eventWorkbook(XLSX,p,ids,locale,zone);
 return XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellNF:true,cellStyles:true});
}
const parts=cell=>{const d=XLSX.SSF.parse_date_code(cell.v);return[d.y,d.m,d.d,d.H,d.M,d.S];};
test('empty BN/EN exports preserve four sheets, ordered headers, timezone and filters',()=>{
 for(const locale of ['bn','en']){
  const p=snapshot();for(const key of keys)p[key]=[];
  const book=roundtrip(p,[],locale);assert.deepEqual(book.SheetNames,sheetNames(locale));
  keys.forEach((key,i)=>{const sheet=book.Sheets[book.SheetNames[i]];
   assert.deepEqual(XLSX.utils.sheet_to_json(sheet,{header:1}),[[...eventExportHeaders(key,locale),locale==='bn'?'সময় অঞ্চল':'Time zone']]);
   assert.equal(sheet['!autofilter'].ref,sheet['!ref']);assert.equal(sheet['!cols'].length,eventExportHeaders(key,locale).length+1);
  });
 }
});
test('validated projection keeps selected parent order and only linked authorized children',()=>{
 const p=snapshot();p.events.push({...event,id:uuid(20),title_en:null,title_bn:'দ্বিতীয়'});
 for(const key of keys)for(const row of p[key])Object.assign(row,{family_id:uuid(2),auth_user_id:'private-user',storage_key:'private-storage',created_by_user_id:'private-user'});
 p.rsvps.push({...rsvp,id:uuid(21),event_id:uuid(20),is_current_user:false,response:'maybe',guest_count:9});
 p.comments.push({...comment,id:uuid(22),event_id:uuid(20)});p.media.push({...media,id:uuid(23),event_id:uuid(20)});
 for(const locale of ['bn','en']){
  const projected=eventExportRows(p,[uuid(20),id],locale);assert.doesNotMatch(JSON.stringify(projected),/private-user|private-storage|family_id|auth_user_id|storage_key/);
  const book=roundtrip(p,[uuid(20),id],locale),s=book.Sheets[book.SheetNames[0]];
  assert.equal(s.A2.v,uuid(20));assert.equal(s.A3.v,id);assert.equal(s.P2.v,0);assert.equal(s.P3.v,3);assert.equal(s.D3.v,event.description_bn);assert.equal(s.E3.v,event.description_en);
  const selected=roundtrip(p,[uuid(20)],locale);keys.forEach((key,i)=>assert.equal(XLSX.utils.decode_range(selected.Sheets[selected.SheetNames[i]]['!ref']).e.r,1));
  assert.equal(selected.Sheets.RSVPs.B2.v,'দ্বিতীয়');assert.equal(selected.Sheets.RSVPs.A2.v,uuid(20));
 }
});
test('money, counts and bytes roundtrip as numeric; zero differs from nullable capacity',()=>{
 const p=snapshot();p.events.push({...event,id:uuid(20),capacity:null,estimated_cost_per_person:0,total_budget:'0.00'});
 for(const locale of ['bn','en']){
  const b=roundtrip(p,undefined,locale),s=b.Sheets[b.SheetNames[0]];
  for(const [cell,value]of [['L2',1.25],['M2',10.5],['N2',12],['P2',3],['L3',0],['M3',0],['P3',0]]){assert.equal(s[cell].t,'n');assert.equal(s[cell].v,value);}
  assert.equal(s.L2.z,'#,##0.00');assert.equal(s.N2.z,'#,##0');assert.equal(s.N3.v,'');
  assert.equal(b.Sheets.RSVPs.E2.t,'n');assert.equal(b.Sheets.RSVPs.E2.v,2);assert.equal(b.Sheets[b.SheetNames[3]].E2.v,68);
 }
});
test('every date column has native date serials in explicit UTC/Dhaka/Los Angeles zones',()=>{
 for(const locale of ['bn','en'])for(const [zone,expected]of [['UTC',[2026,10,12,23,45,0]],['Asia/Dhaka',[2026,10,13,5,45,0]],['America/Los_Angeles',[2026,10,12,16,45,0]]]){
  const p=snapshot();p.events[0].end_at=stamp;p.events[0].registration_deadline=stamp;
  const b=roundtrip(p,undefined,locale,zone);
  for(const [i,columns]of [[0,['G','H','O','R','S']],[1,['G']],[2,['E']],[3,['H']]])for(const c of columns){const cell=b.Sheets[b.SheetNames[i]][c+'2'];assert.equal(cell.t,'n');assert.equal(cell.z,'yyyy-mm-dd hh:mm:ss');assert.deepEqual(parts(cell),expected);assert.ok(Math.abs((cell.v*86400000)%1000-125)<0.01);}
  for(const [i,c]of [[0,'T'],[1,'H'],[2,'F'],[3,'I']])assert.equal(b.Sheets[b.SheetNames[i]][c+'2'].v,zone);
 }
 const s=roundtrip().Sheets.Events;assert.equal(s.H2.v,'');assert.equal(s.O2.v,'');
});
test('1900 serials and leap days retain Excel calendar semantics',()=>{
 for(const [date,serial,expected]of [['1900-01-01T00:00:00Z',1,[1900,1,1,0,0,0]],['1900-02-28T00:00:00Z',59,[1900,2,28,0,0,0]],['1900-03-01T00:00:00Z',61,[1900,3,1,0,0,0]],['2024-02-29T00:00:00Z',45351,[2024,2,29,0,0,0]]]){
  const p=snapshot();p.events[0].created_at=date;const cell=roundtrip(p).Sheets.Events.R2;assert.equal(cell.v,serial);assert.deepEqual(parts(cell),expected);
 }
});
test('formula-looking user text remains literal without formulas or hyperlinks',()=>{
 const p=snapshot();Object.assign(p.events[0],{title_en:'=SUM(1,2)',description_en:'+command',city:'-command',venue:'@command'});p.comments[0].body='=1+1';p.media[0].caption='https://example.test';
 const b=roundtrip(p);for(const s of Object.values(b.Sheets))for(const [key,cell]of Object.entries(s))if(!key.startsWith('!')){assert.equal(cell.f,undefined);assert.equal(cell.F,undefined);assert.equal(cell.l,undefined);}
 for(const [cell,value]of [['C2','=SUM(1,2)'],['E2','+command'],['I2','@command'],['J2','-command']]){assert.equal(b.Sheets.Events[cell].t,'s');assert.equal(b.Sheets.Events[cell].v,value);}
 assert.equal(b.Sheets.Discussion.D2.v,'=1+1');
});
test('malformed/duplicate/orphan/wrong-scope/unauthorized/migration data fails closed even when hidden',()=>{
 const variants=[p=>p.events.push({...event}),p=>p.comments[0].event_id=uuid(999),p=>p.media[0].family_id=uuid(999),p=>p.rsvps[0].guest_count='2',p=>p.events[0].total_budget='10oops',p=>p.events[0].start_at='2026-02-30T00:00:00Z',p=>p.events[0].created_at=null,p=>p.media[0].file_size=-1,p=>p.comments[0].body={},p=>p.permissions.canManage='true',p=>{p.permissions.canManage=false;p.events[0].status='draft';},p=>{for(const k of keys)p[k]=[];p.migrationRequired=true;}];
 for(const mutate of variants){const p=snapshot();mutate(p);assert.throws(()=>eventWorkbook(XLSX,p,[],'en','UTC'),/EVENT_EXPORT_INVALID_DATA/);}
 for(const ids of [[id,id],[uuid(999)],['bad'],null])assert.throws(()=>eventWorkbook(XLSX,snapshot(),ids,'en','UTC'),/EVENT_EXPORT_INVALID_DATA/);
 for(const zone of ['Invalid/Zone','',undefined,null,' UTC '])assert.throws(()=>eventWorkbook(XLSX,snapshot(),[id],'en',zone),/EVENT_EXPORT_INVALID_DATA/);
 assert.throws(()=>eventWorkbook(XLSX,snapshot(),[id],'unsupported','UTC'),/EVENT_EXPORT_INVALID_DATA/);
 for(const [date,zone]of [['1899-12-31T00:00:00Z','UTC'],['1900-01-01T00:00:00Z','America/Los_Angeles'],['9999-12-31T23:59:59Z','Asia/Dhaka']]){const p=snapshot();p.events[0].created_at=date;assert.throws(()=>eventWorkbook(XLSX,p,[id],'en',zone),/EVENT_EXPORT_INVALID_DATA/);}
 const row=eventExportRows(snapshot(),[id],'en').events[0];assert.throws(()=>eventWorksheet(XLSX,'events',[{...row,'Capacity':1.5}],'en','UTC'),/EVENT_EXPORT_INVALID_DATA/);
});
test('20,000 synthetic parents/RSVPs preserve count, order and going totals without writes',()=>{
 const p=snapshot();p.events=Array.from({length:20000},(_,i)=>({...event,id:uuid(100+i)}));p.rsvps=p.events.map((e,i)=>({...rsvp,id:uuid(20100+i),event_id:e.id}));p.comments=[];p.media=[];
 const projected=eventExportRows(p,p.events.map(e=>e.id),'en');assert.equal(projected.events.length,20000);assert.equal(projected.rsvps.length,20000);assert.equal(projected.events[19999]['Event ID'],uuid(20099));assert.equal(projected.events[19999].Participants,3);
 const s=eventWorksheet(XLSX,'events',projected.events,'en','UTC');assert.equal(s['!ref'],'A1:T20001');assert.equal(s.P20001.v,3);
});
test('UI exports explicit snapshot with mutex, stale-view guards and localized safe failures',()=>{
 const s=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8');
 for(const text of ['exportBusy.current','requestGate.current.cancel()','changeEventView("query"','changeEventView("filter"','resolvedOptions().timeZone','eventWorkbook(XLSX','visibleEvents.map(event => event.id)','EVENT_EXPORT_INVALID_DATA','EVENT_EXPORT_FAILED','requestGate.current.current(checkpoint)'])assert.ok(s.includes(text),text);
 assert.ok(s.indexOf('eventWorkbook(XLSX')<s.indexOf('XLSX.writeFile(workbook'));
 const body=s.slice(s.indexOf('  async function exportXlsx() {'),s.indexOf('\n  useEffect(',s.indexOf('  async function exportXlsx() {')));
 const catchBody=body.slice(body.indexOf('} catch (error)'));
 assert.ok(catchBody.indexOf('!requestGate.current.current(checkpoint)')<catchBody.indexOf('kind: "error"'));
 for(const locale of ['bn','en'])for(const code of ['EVENT_EXPORT_INVALID_DATA','EVENT_EXPORT_FAILED'])assert.ok(eventErrorCopy(code,locale));
});
