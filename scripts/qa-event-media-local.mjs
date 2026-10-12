// Opt-in: only new labeled Event/media fixtures, no real delivery or existing edits.
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {eventMutationAcknowledged,eventReadSnapshot} from '../lib/event-write-outcome.ts';
import {eventMediaExpected,eventMediaAcknowledged} from '../lib/event-media-workflow.ts';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(!args.includes('--allow-local-qa-writes'))throw Error('Explicit --allow-local-qa-writes required.');
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Credential-free loopback required.');
const family='20000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000001';
const prefix=args.includes('--prefix')?option('--prefix'):'QA Event Media '+new Date().toISOString().replace(/\D/g,'').slice(0,14);
if(!/^QA Event Media \d{14}$/.test(prefix))throw Error('Exact synthetic prefix required.');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=','base64'),gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
// Valid 768x768 RGB PNG with uncompressed deflate, deliberately >1 MiB.
const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
const chunk=(type,data)=>{const buffer=Buffer.alloc(data.length+12);buffer.writeUInt32BE(data.length);buffer.write(type,4);data.copy(buffer,8);buffer.writeUInt32BE(crc32(buffer.subarray(4,-4)),buffer.length-4);return buffer;};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(768);ihdr.writeUInt32BE(768,4);ihdr[8]=8;ihdr[9]=2;
const pixels=Buffer.alloc(768*(768*3+1));for(let y=0;y<768;y++)for(let x=0;x<768*3;x++)pixels[y*(768*3+1)+1+x]=(x+y*31)%256;
const largePng=Buffer.concat([png.subarray(0,8),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels,{level:0})),chunk('IEND',Buffer.alloc(0))]);
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=a=>{assert.ok(a);checks++;};
async function call(path,method='GET',body,expected=200,active=family,signed=true,raw=false){
 const isForm=body instanceof FormData;
 const r=await fetch(new URL(path,origin),{method,signal:AbortSignal.timeout(20000),headers:{...(signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{}),...(body!==undefined&&!isForm?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:isForm||raw?body:JSON.stringify(body)}:{})});
 const responseText=await r.text();let p;try{p=JSON.parse(responseText);}catch{p={error:responseText};}
 if(method==='POST'&&p.success===true&&p.id)console.log(JSON.stringify({prefix,path,id:p.id,status:r.status}));
 if(r.status!==expected)console.log(JSON.stringify({prefix,path,method,status:r.status,expected,code:p.code??null}));
 eq(r.status,expected);if(method!=='GET'&&r.ok)eq(path.endsWith('/media')||path.startsWith('/api/event-media/')?eventMediaAcknowledged(eventMediaExpected(path,method,body),r.status,p):eventMutationAcknowledged(method,path.split('/')[3],body??{},r.status,p),true);
 if(method==='GET'&&path==='/api/events'&&r.ok)ok(eventReadSnapshot(p,active));
 return p;
}
const form=(file,caption=prefix+' caption')=>{const f=new FormData();if(file!==undefined)f.set('file',file);if(caption!==undefined)f.set('caption',caption);return f;};
const newPng=suffix=>new File([png],prefix+'-'+suffix+'.png',{type:'image/png'});
async function bytes(id,expected=200,active=family,signed=true,value){
 const r=await fetch(new URL('/api/event-media/'+id,origin),{headers:signed?{Cookie:'__sites_local_auth=1; fms_active_family='+active}:{},signal:AbortSignal.timeout(20000)});
 eq(r.status,expected);if(expected===200){eq(r.headers.get('Cache-Control'),'private, no-store');eq(r.headers.get('X-Content-Type-Options'),'nosniff');ok(r.headers.get('ETag'));eq(Buffer.from(await r.arrayBuffer()),value);}
}
const before=await call('/api/events'),otherBefore=await call('/api/events','GET',undefined,200,other);eq(before.permissions.canManage,true);eq(before.migrationRequired,false);
let id=args.includes('--event-id')?option('--event-id'):null;
const filter=p=>({...p,events:p.events.filter(r=>r.id!==id),rsvps:p.rsvps.filter(r=>r.event_id!==id),comments:p.comments.filter(r=>r.event_id!==id),media:p.media.filter(r=>r.event_id!==id)}),unchanged=filter(before);
if(args.includes('--cleanup')){
 if(!id||!args.includes('--media-id'))throw Error('Cleanup requires exact parent/media IDs and prefix.');
 const event=before.events.find(r=>r.id===id);ok(event);eq(event.title_bn,prefix);eq(event.status,'draft');
 for(const field of ['rsvps','comments'])eq(before[field].some(r=>r.event_id===id),false);
 const rows=before.media.filter(r=>r.event_id===id);eq(rows.length,1);eq(rows[0].id,option('--media-id'));eq(rows[0].file_name,prefix+'-parent.png');eq(rows[0].mime_type,'image/png');eq(rows[0].file_size,png.length);eq(rows[0].caption,prefix+' caption');
 await call('/api/events/'+id,'DELETE');await bytes(rows[0].id,404);await call('/api/event-media/'+rows[0].id,'DELETE',undefined,404);await call('/api/events/'+id,'DELETE',undefined,404);
 eq(await call('/api/events'),unchanged);eq(await call('/api/events','GET',undefined,200,other),otherBefore);
 const logs=(await call('/api/admin')).auditLogs;ok(logs.some(r=>r.entity_id===id&&r.action==='family_event_deleted'));ok(logs.some(r=>r.entity_id===rows[0].id&&r.action==='event_media_uploaded'));
 console.log(JSON.stringify({prefix,id,mediaId:rows[0].id,checks,parentDeleted:1,linkedMediaRowsDeleted:1,unrelatedDataUnchanged:true}));process.exit(0);
}
if(id){
 if(!args.includes('--resume-no-media'))throw Error('Resume requires explicit no-media preflight.');
 const event=before.events.find(r=>r.id===id);ok(event);eq(event.title_bn,prefix);eq(event.status,'published');
 for(const field of ['rsvps','comments','media'])eq(before[field].some(r=>r.event_id===id),false);
}else id=(await call('/api/events','POST',{titleBn:prefix,descriptionBn:'Synthetic media QA only, not a genuine announcement.',venue:'QA Media Location',startAt:'2099-01-01T12:00:00+06:00',status:'draft'},201)).id;
const path='/api/events/'+id+'/media';
if(!args.includes('--resume-no-media')){await call(path,'POST',form(newPng('draft')),404);await call('/api/events/'+id,'PATCH',{action:'publish'});}
await call(path,'POST',form(newPng('unsigned')),401,family,false);await call(path,'POST',form(newPng('other-family')),404,other);
eq((await call('/api/events/not-a-uuid/media','POST',form(newPng('invalid-id')),400)).code,'EVENT_INVALID_ID');
eq((await call(path,'POST','{',400,family,true,true)).code,'EVENT_MEDIA_INVALID_FILE');
for(const file of [undefined,'not a file',new File(['<script>bad</script>'],'spoof.png',{type:'image/png'}),new File([png],'wrong.exe',{type:'image/png'}),new File(['svg'],'bad.svg',{type:'image/svg+xml'}),new File([],'empty.png',{type:'image/png'}),new File([png,Buffer.alloc(8*1024*1024+1)],'too-large.png',{type:'image/png'})])eq((await call(path,'POST',form(file),400)).code,'EVENT_MEDIA_INVALID_FILE');
eq((await call(path,'POST',form(newPng('long-caption'),'x'.repeat(501)),400)).code,'EVENT_MEDIA_INVALID_CAPTION');
eq((await call(path,'POST',form(newPng('file-caption'),newPng('caption')),400)).code,'EVENT_MEDIA_INVALID_CAPTION');
const duplicate=form(newPng('duplicate'));duplicate.append('file',newPng('duplicate-2'));eq((await call(path,'POST',duplicate,400)).code,'EVENT_MEDIA_INVALID_FILE');
const dupCaption=form(newPng('duplicate-caption'));dupCaption.append('caption','another');eq((await call(path,'POST',dupCaption,400)).code,'EVENT_MEDIA_INVALID_FILE');
eq(filter(await call('/api/events')),unchanged);
const deletedIds=[];
for(const [file,value,mime]of [[newPng('delete'),png,'image/png'],[new File([gif],prefix+'-delete.gif',{type:'image/gif'}),gif,'image/gif'],[new File([largePng],prefix+'-large-delete.png',{type:'image/png'}),largePng,'image/png']]){
 const p=await call(path,'POST',form(file),201),mediaId=p.id;eq(p.media.file_name,file.name);eq(p.media.mime_type,mime);eq(p.media.file_size,file.size);eq(p.media.caption,prefix+' caption');
 for(const key of ['family_id','storage_key','uploaded_by_user_id'])eq(Object.hasOwn(p.media,key),false);
 await bytes(mediaId,200,family,true,value);await bytes(mediaId,401,family,false);await bytes(mediaId,404,other);
 await call('/api/event-media/'+mediaId,'DELETE',undefined,401,family,false);await call('/api/event-media/'+mediaId,'DELETE',undefined,404,other);
 const snapshot=await call('/api/events');eq(snapshot.media.filter(r=>r.event_id===id).length,1);eq(snapshot.media.find(r=>r.id===mediaId),p.media);
 await call('/api/event-media/'+mediaId,'DELETE');await bytes(mediaId,404);await call('/api/event-media/'+mediaId,'DELETE',undefined,404);eq((await call('/api/events')).media.some(r=>r.id===mediaId),false);deletedIds.push(mediaId);
}
for(const method of ['GET','DELETE']){if(method==='GET')await bytes('not-a-uuid',400);else eq((await call('/api/event-media/not-a-uuid',method,undefined,400)).code,'EVENT_INVALID_ID');}
const p=await call(path,'POST',form(newPng('parent')),201),mediaId=p.id;await bytes(mediaId,200,family,true,png);
await call('/api/events/'+id,'PATCH',{action:'draft'});
const after=await call('/api/events');eq(after.media.filter(r=>r.event_id===id).length,1);eq(filter(after),unchanged);eq(await call('/api/events','GET',undefined,200,other),otherBefore);
const logs=(await call('/api/admin')).auditLogs;for(const deleted of deletedIds){ok(logs.some(r=>r.entity_id===deleted&&r.action==='event_media_uploaded'));ok(logs.some(r=>r.entity_id===deleted&&r.action==='event_media_deleted'));}ok(logs.some(r=>r.entity_id===mediaId&&r.action==='event_media_uploaded'));
console.log(JSON.stringify({prefix,id,mediaId,deletedIds,checks,largeFileBytesTested:largePng.length,finalStatus:'draft',unrelatedDataUnchanged:true,cleanupPending:true}));
