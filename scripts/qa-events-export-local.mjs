// Read-only loopback acceptance harness. No database/files/audit/SQL mutations.
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {eventWorkbook,eventExportRows,eventExportHeaders} from '../lib/event-export.ts';
import {eventSafeSnapshot} from '../lib/event-read.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];
const keys=['events','rsvps','comments','media'],dates=[[6,7,14,17,18],[6],[4],[7]];
let checks=0,workbooks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},valid=a=>{assert.ok(a);checks++;};
async function read(family){const r=await fetch(new URL('/api/events',origin),{cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Cookie:'__sites_local_auth=1; fms_active_family='+family}});equal(r.status,200);const p=await r.json();valid(eventSafeSnapshot(p));equal(p.family.id,family);equal(p.migrationRequired,false);return p;}
const snapshots=[];
for(const family of families){
 const p=await read(family);snapshots.push(p);
 for(const locale of ['bn','en'])for(const ids of [p.events.map(e=>e.id),p.events.slice(0,1).map(e=>e.id),[]]){
  const source=eventWorkbook(XLSX,p,ids,locale,'Asia/Dhaka'),projected=eventExportRows(p,ids,locale);
  const b=XLSX.read(XLSX.write(source,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellNF:true});workbooks++;
  equal(b.SheetNames,locale==='bn'?['ইভেন্ট','RSVPs','আলোচনা','মিডিয়া']:['Events','RSVPs','Discussion','Media']);
  keys.forEach((key,i)=>{const s=b.Sheets[b.SheetNames[i]],headers=eventExportHeaders(key,locale),rows=projected[key];
   equal(XLSX.utils.decode_range(s['!ref']).e.r,rows.length);equal(s['!autofilter'].ref,s['!ref']);
   equal(XLSX.utils.sheet_to_json(s,{header:1})[0],[...headers,locale==='bn'?'সময় অঞ্চল':'Time zone']);
   rows.forEach((row,r)=>{headers.forEach((header,c)=>{const cell=s[XLSX.utils.encode_cell({r:r+1,c})];
    equal(cell.f,undefined);equal(cell.l,undefined);
    if(dates[i].includes(c)&&row[header]){equal(cell.t,'n');equal(cell.z,'yyyy-mm-dd hh:mm:ss');valid(Number.isFinite(cell.v));
     const code=XLSX.SSF.parse_date_code(cell.v),d=new Date(row[header]);
     const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',calendar:'gregory',numberingSystem:'latn',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(d);
     const part=type=>Number(parts.find(p=>p.type===type).value);equal([code.y,code.m,code.d,code.H,code.M,code.S],['year','month','day','hour','minute','second'].map(part));
    }else{equal(cell.v,row[header]??'');equal(cell.t,typeof row[header]==='number'?'n':'s');}
   });equal(s[XLSX.utils.encode_cell({r:r+1,c:headers.length})].v,'Asia/Dhaka');});
  });
 }
}
for(let i=0;i<families.length;i++)equal(await read(families[i]),snapshots[i]);
console.log(JSON.stringify({checks,workbooks,counts:snapshots.map(p=>({family:p.family.id,events:p.events.length,rsvps:p.rsvps.length,comments:p.comments.length,media:p.media.length})),readOnly:true,rowsUnchanged:true,downloadInRealBrowser:false,realSeparateUsers:false}));
