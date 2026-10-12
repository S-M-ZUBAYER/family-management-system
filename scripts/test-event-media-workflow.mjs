import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {eventMediaMetadata,eventMediaCaption,eventMediaHeaderMatches,validateEventMedia,eventMediaPublicRow,eventMediaUploadWrite,eventMediaDeleteWrite,eventMediaResponse,EventMediaPrewriteError,eventMediaPrewriteResponse,eventMediaExpected,eventMediaAcknowledged,eventMediaFeedback,readEventMediaMutation} from '../lib/event-media-workflow.ts';
import {EventValidationError,eventErrorCopy} from '../lib/event-validation.ts';
import {EventWriteOutcomeUnknownError,EventWriteRejectedError} from '../lib/event-write-outcome.ts';
const family='20000000-0000-4000-8000-000000000002',parent='20000000-0000-4000-8000-000000000010',id='20000000-0000-4000-8000-000000000011',other='20000000-0000-4000-8000-000000000012';
const key='families/'+family+'/events/'+parent+'/'+id+'.png',actor='qa-owner',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlpAAAAAASUVORK5CYII=','base64');
const file=new File([png],'QA.png',{type:'image/png'}),metadata=eventMediaMetadata(file),row={id,family_id:family,event_id:parent,storage_key:key,uploaded_by_user_id:actor,file_name:file.name,mime_type:file.type,file_size:file.size,caption:'QA caption',uploader_name:'QA owner',created_at:'2026-10-12T10:00:00Z'};
const rejected=e=>e?.status>=400&&e.status<500&&e.status!==408;
const uploadOpts=overrides=>({familyId:family,eventId:parent,actorId:actor,key,file:metadata,caption:row.caption,put:async()=>{},create:async()=>[row],discard:async()=>{},confirmedRejected:rejected,audit:async()=>{},...overrides});
const deleteOpts=overrides=>({id,familyId:family,eventId:parent,key,write:async()=>[row],cleanup:async()=>{},audit:async()=>{},confirmedRejected:rejected,...overrides});
const form=()=>{const f=new FormData();f.set('file',file);f.set('caption',' QA caption ');return f;};
const path='/api/events/'+parent+'/media',delPath='/api/event-media/'+id;
test('metadata and caption reject bad names/extensions/types/sizes/coercion without truncation',()=>{
 assert.equal(eventMediaMetadata({name:'ছবি.JPEG',type:'image/jpeg',size:1}).extension,'jpg');assert.equal(eventMediaMetadata({name:'blob',type:'video/mp4',size:25*1024*1024}).extension,'mp4');
 for(const patch of [{name:''},{name:'x'.repeat(221)},{name:'../x.png'},{name:'x\\x.png'},{name:'x\0.png'},{name:'x.exe'},{type:'constructor'},{type:'image/svg+xml'},{size:'1'},{size:0},{size:1.5},{size:8*1024*1024+1}])assert.throws(()=>eventMediaMetadata({...metadata,...patch}),EventValidationError);
 assert.equal(eventMediaCaption(' QA '),'QA');assert.equal(eventMediaCaption(null),null);for(const value of [true,[],{},'x'.repeat(501)])assert.throws(()=>eventMediaCaption(value),/EVENT_MEDIA_INVALID_CAPTION/);
});
test('bounded headers support images/video and reject spoofing, bad dimensions/container sizes and non-WebM EBML',async()=>{
 assert.equal(eventMediaHeaderMatches('image/png',png,png.length),true);await validateEventMedia(file);
 for(const type of ['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm'])assert.equal(eventMediaHeaderMatches(type,Buffer.from('<script>wrong type</script>'),26),false);
 const mp4=Buffer.alloc(24);mp4.writeUInt32BE(24);mp4.write('ftypisom',4);assert.equal(eventMediaHeaderMatches('video/mp4',mp4,24),true);assert.equal(eventMediaHeaderMatches('video/mp4',mp4,20),false);
 const webm=Buffer.from([26,69,223,163,135,66,130,132,119,101,98,109]);assert.equal(eventMediaHeaderMatches('video/webm',webm,12),true);
 assert.equal(eventMediaHeaderMatches('video/webm',Buffer.from([26,69,223,163,129,66,130,132,119,101,98,109]),12),false);
 assert.equal(eventMediaHeaderMatches('video/webm',Buffer.from([26,69,223,163,135,66,130,132,109,107,118,32]),12),false);
 await assert.rejects(validateEventMedia(new File(['not png'],'QA.png',{type:'image/png'})),EventValidationError);
});
test('upload confirms scoped requested metadata before audit and only exposes public fields',async()=>{
 for(const pending of [false,true]){const order=[];const result=await eventMediaUploadWrite(uploadOpts({put:async()=>order.push('put'),create:async()=>{order.push('create');return[row];},discard:async()=>assert.fail('discard confirmed object'),audit:async saved=>{order.push('audit');assert.equal(saved,id);if(pending)throw Error('simulated');}}));
 assert.deepEqual(order,['put','create','audit']);const response=eventMediaResponse(result),p=await response.json();assert.equal(response.status,pending?202:201);assert.equal(eventMediaAcknowledged(eventMediaExpected(path,'POST',form()),response.status,p),true);
 for(const field of ['family_id','storage_key','uploaded_by_user_id'])assert.equal(Object.hasOwn(p.media,field),false);}
 assert.equal(eventMediaPublicRow({...row,created_at:'bad'}),null);assert.equal(eventMediaPublicRow({...row,file_size:'1'}),null);
});
test('put failure and confirmed metadata rejection discard only unlinked object; cleanup failures are explicit',async()=>{
 for(const cause of ['put','create'])for(const cleanupPending of [false,true]){let creates=0,discards=0,audits=0;
 await assert.rejects(eventMediaUploadWrite(uploadOpts({put:async()=>{if(cause==='put')throw Error('put failed');},create:async()=>{creates++;throw {status:409};},discard:async()=>{discards++;if(cleanupPending)throw Error('discard failed');},audit:async()=>audits++})),e=>cause==='create'&&!cleanupPending?e instanceof EventWriteRejectedError:e instanceof EventMediaPrewriteError&&e.cleanupPending===cleanupPending);
 assert.equal(creates,cause==='create'?1:0);assert.equal(discards,1);assert.equal(audits,0);}
 const r=eventMediaPrewriteResponse(new EventMediaPrewriteError(true));assert.equal(r.status,503);assert.equal((await r.json()).cleanupPending,true);
});
test('ambiguous metadata writes retain potentially linked object and never audit/retry/compensate',async()=>{
 for(const value of [null,{},[],[{}],[row,row],[{...row,family_id:other}],[{...row,event_id:other}],[{...row,uploaded_by_user_id:'another'}],[{...row,storage_key:key+'x'}],[{...row,file_name:'wrong.png'}],[{...row,caption:'wrong'}]]){
 let creates=0;await assert.rejects(eventMediaUploadWrite(uploadOpts({create:async()=>{creates++;return value;},discard:async()=>assert.fail('unsafe discard'),audit:async()=>assert.fail('phantom audit')})),EventWriteOutcomeUnknownError);assert.equal(creates,1);}
 for(const error of [Error('lost reply'),{status:408},{status:502}])await assert.rejects(eventMediaUploadWrite(uploadOpts({create:async()=>{throw error;},discard:async()=>assert.fail('unsafe discard'),audit:async()=>assert.fail('audit')})),EventWriteOutcomeUnknownError);
});
test('delete requires exact confirmed row before captured-key cleanup and retains independent pending flags',async()=>{
 for(const cleanupPending of [false,true])for(const auditPending of [false,true]){const order=[];const result=await eventMediaDeleteWrite(deleteOpts({write:async()=>{order.push('write');return[row];},cleanup:async()=>{order.push('cleanup');if(cleanupPending)throw Error('simulated');},audit:async flag=>{order.push('audit');assert.equal(flag,cleanupPending);if(auditPending)throw Error('simulated');}}));
 assert.deepEqual(order,['write','cleanup','audit']);assert.equal(result.cleanupPending,cleanupPending);assert.equal(result.auditPending,auditPending);const response=eventMediaResponse(result);assert.equal(response.status,cleanupPending||auditPending?202:200);assert.equal(eventMediaAcknowledged(eventMediaExpected(delPath,'DELETE'),response.status,await response.json()),true);}
});
test('delete conflicts/wrong-scope/lost replies never clean files or write phantom audits',async()=>{
 for(const value of [[],null,{},[{}],[row,row],[{...row,id:other}],[{...row,family_id:other}],[{...row,event_id:other}],[{...row,storage_key:key+'x'}]])await assert.rejects(eventMediaDeleteWrite(deleteOpts({write:async()=>value,cleanup:async()=>assert.fail('unsafe cleanup'),audit:async()=>assert.fail('phantom audit')})),Array.isArray(value)&&value.length===0?EventValidationError:EventWriteOutcomeUnknownError);
 let writes=0;await assert.rejects(eventMediaDeleteWrite(deleteOpts({key:'families/'+other+'/events/'+parent+'/'+id+'.png',write:async()=>writes++})),EventValidationError);assert.equal(writes,0);
 for(const error of [Error('lost'),{status:408},{status:503},{status:409}])await assert.rejects(eventMediaDeleteWrite(deleteOpts({write:async()=>{throw error;},cleanup:async()=>assert.fail('cleanup'),audit:async()=>assert.fail('audit')})),error.status===409?EventWriteRejectedError:EventWriteOutcomeUnknownError);
});
test('typed acknowledgements, cancellation, known rejection, malformed replies and bilingual modal mapping',async()=>{
 const p=await eventMediaResponse(await eventMediaUploadWrite(uploadOpts())).json(),expected=eventMediaExpected(path,'POST',form());
 for(const bad of [null,[],{}, {...p,id:other},{...p,success:'true'},{...p,auditPending:'true'},{...p,media:{...p.media,caption:'different'}},{...p,outcomeUnknown:true}])assert.equal(eventMediaAcknowledged(expected,201,bad),false);
 assert.equal(eventMediaAcknowledged(expected,202,p),false);assert.equal(eventMediaExpected(path,'POST','not form'),null);
 for(const [status,payload,kind]of [[499,null,'cancelled'],[400,{},'rejected'],[413,{},'rejected'],[503,{code:'EVENT_MEDIA_STORAGE_UNAVAILABLE'},'rejected'],[503,{code:'EVENT_MEDIA_UPLOAD_REJECTED'},'rejected'],[503,{code:'EVENT_MEDIA_UNLINKED_PENDING'},'unknown'],[503,{},'unknown'],[408,{},'unknown'],[201,null,'unknown'],[201,p,'confirmed']]){let calls=0;assert.equal((await readEventMediaMutation(async()=>{calls++;return Response.json(payload,{status});},path,'POST',form())).kind,kind);assert.equal(calls,1);}
 assert.equal((await readEventMediaMutation(async()=>new Response('Payload Too Large',{status:413}),path,'POST',form())).payload.code,'EVENT_MEDIA_INVALID_FILE');
 assert.equal((await readEventMediaMutation(async()=>{throw Error('lost');},path,'POST',form())).kind,'unknown');
 for(const locale of ['bn','en']){for(const code of ['EVENT_MEDIA_INVALID_FILE','EVENT_MEDIA_INVALID_CAPTION','EVENT_MEDIA_PENDING','EVENT_MEDIA_UNKNOWN','EVENT_MEDIA_UNLINKED_PENDING','EVENT_MEDIA_UPLOAD_REJECTED','EVENT_MEDIA_STORAGE_UNAVAILABLE'])assert.ok(eventErrorCopy(code,locale));
 assert.equal(eventMediaFeedback(path,503,{},locale).kind,'info');assert.equal(eventMediaFeedback(delPath,200,{},locale,'DELETE').kind,'info');assert.equal(eventMediaFeedback(path,503,{code:'EVENT_MEDIA_STORAGE_UNAVAILABLE'},locale).kind,'error');assert.equal(eventMediaFeedback(path,503,{code:'EVENT_MEDIA_UNLINKED_PENDING'},locale).kind,'info');assert.equal(eventMediaFeedback('/api/events/'+parent+'/rsvp',503,{},locale),null);}
});
test('route/UI wiring preserves scope, typed outcomes, cancel, file retention and export invalidation',()=>{
 const upload=readFileSync(new URL('../app/api/events/[id]/media/route.ts',import.meta.url),'utf8'),item=readFileSync(new URL('../app/api/event-media/[id]/route.ts',import.meta.url),'utf8'),center=readFileSync(new URL('../app/event-center.tsx',import.meta.url),'utf8'),provider=readFileSync(new URL('../components/action-modal-provider.tsx',import.meta.url),'utf8');
 for(const text of ['getActiveFamilyMembership(user.userId)','validateEventMedia(file)','eventMediaCaption','eventMediaUploadWrite','eventMediaResponse','discard: () => bucket.delete(key)','event_media_uploaded'])assert.ok(upload.includes(text),text);
 assert.ok(!upload.includes('uploadedKey'));for(const text of ['eventCapturedMediaKeys([media]','storage_key: `eq.${media.storage_key}`','uploaded_by_user_id: `eq.${media.uploaded_by_user_id}`','eventMediaDeleteWrite','eventMediaResponse','private, no-store','nosniff'])assert.ok(item.includes(text),text);
 assert.equal(ts.createSourceFile('event.tsx',center,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);assert.equal(ts.createSourceFile('modal.tsx',provider,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);
 for(const text of ['readEventMediaMutation','await validateEventMedia(file)','eventMediaCaption(mediaCaption)','if (response.status === 499) return response;','if (!outcome?.media) return;','setMediaFile(null)','Retry selected file','eventMediaFeedback(path, 503','if (!outcome.pending) setFeedback'])assert.ok(center.includes(text),text);
 assert.ok(center.indexOf('if (!outcome?.media) return;')<center.indexOf('setMediaCaption(""); setMediaFile(null)'));assert.ok(provider.includes('const mediaResult'));assert.ok(provider.includes('const mediaFailure'));assert.ok(provider.includes('eventMediaFeedback(url.pathname, response.status, mediaPayload, locale, method, init?.body)'));
 const config=readFileSync(new URL('../next.config.ts',import.meta.url),'utf8');assert.ok(config.includes('bodySizeLimit: "26mb"'));
 for(const locale of ['bn','en'])assert.equal(eventMediaFeedback(path,413,{},locale,'POST',form()).kind,'error');
});
