import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as flow from '../lib/health-document-workflow.ts';
import * as validation from '../lib/health-validation.ts';
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000091',actor='qa-owner',scope={familyId:family,actorId:actor},stamp='2026-10-14T09:00:00.123456Z';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kQ8sAAAAASUVORK5CYII=','base64');
function form(patch={}){const f=new FormData();f.set('file',new File([png],'QA-only.png',{type:'image/png'}));f.set('title','QA private file');f.set('category','other');f.set('documentDate','2026-10-14');f.set('notes','QA "quoted", বাংলা \\');f.set('expectedFamilyId',family);f.set('expectedActorId',actor);for(const[k,v]of Object.entries(patch))f.set(k,v);return f;}
const input=flow.healthDocumentInput(form()),key='families/'+family+'/health/'+actor+'/'+id+'.png';
const row={id,family_id:family,auth_user_id:actor,storage_key:key,file_name:input.metadata.name,mime_type:input.metadata.type,file_size:input.metadata.size,category:input.category,title:input.title,document_date:input.documentDate,notes:input.notes,created_at:stamp};
const publicRow=flow.healthDocumentPublic(row),delBody={expectedScope:scope,expectedDocument:publicRow},delPath='/api/health-document/'+id;
const upload=(extra={})=>({id,key,input,put:async()=>({key,size:png.length}),create:async()=>[row],discardUnlinked:async()=>{},audit:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
const remove=(extra={})=>({id,scope,expected:publicRow,existing:row,removeRecord:async()=>[row],removeUnreferencedObject:async()=>{},audit:async()=>{},rejected:e=>e?.status>=400&&e.status<500&&e.status!==408,...extra});
test('strict multipart scope, duplicate/unknown fields, dates, bounded metadata and unsafe filenames',()=>{
 assert.deepEqual(input.scope,scope);assert.equal(input.metadata.extension,'png');assert.equal(flow.healthDocumentInput(form({title:'  '})).title,'QA-only.png');
 for(const patch of [{expectedActorId:'other'},{expectedFamilyId:id},{title:'x'.repeat(181)},{notes:'x'.repeat(2001)},{category:'unknown'},{documentDate:'2026-02-30'},{file:new File([png],'../../private.png',{type:'image/png'})},{file:new File([png],'a.pdf',{type:'image/png'})}])assert.throws(()=>flow.healthDocumentInput(form(patch),scope),flow.HealthDocumentError);
 const duplicate=form();duplicate.append('title','repeat');assert.throws(()=>flow.healthDocumentInput(duplicate));const unknown=form();unknown.set('storage_key','spoof');assert.throws(()=>flow.healthDocumentInput(unknown));
 assert.equal(flow.healthDocumentMetadata({name:'qa.pdf',type:'application/pdf',size:flow.healthDocumentLimit}).size,flow.healthDocumentLimit);for(const size of [0,-1,flow.healthDocumentLimit+1,'68',1.5])assert.throws(()=>flow.healthDocumentMetadata({name:'qa.pdf',type:'application/pdf',size}));
});
test('bounded PNG/PDF/DOC/DOCX header checks reject malformed headers; not malware or Office subtype validation',async()=>{
 assert.ok(await flow.healthDocumentHeader(input.file));assert.ok(await flow.healthDocumentHeader(new File(['%PDF-1.7\nQA'],'qa.pdf',{type:'application/pdf'})));
 const ole=new Uint8Array(512);ole.set([208,207,17,224,161,177,26,225]);assert.ok(await flow.healthDocumentHeader(new File([ole],'qa.doc',{type:'application/msword'})));
 const zip=new Uint8Array(30);zip.set([80,75,3,4]);assert.ok(await flow.healthDocumentHeader(new File([zip],'qa.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})));
 await assert.rejects(flow.healthDocumentHeader(new File(['not PNG'],'qa.png',{type:'image/png'})),flow.HealthDocumentError);
});
test('public document and captured key filter omit ownership metadata and protect all observed content',()=>{
 assert.ok(publicRow);for(const k of ['family_id','auth_user_id','storage_key'])assert.equal(Object.hasOwn(publicRow,k),false);
 for(const patch of [{created_at:'bad'},{notes:'x'.repeat(2001)},{file_size:'68'},{mime_type:'text/html'},{title:''}])assert.equal(flow.healthDocumentPublic({...row,...patch}),null);
 assert.equal(flow.healthDocumentKey(key,scope),true);assert.equal(flow.healthDocumentKey(key,{...scope,actorId:'other'}),false);assert.equal(flow.healthDocumentKey(key+'/../secret',scope),false);
 const q=flow.healthDocumentFilter(publicRow,key,scope);for(const field of [...Object.keys(publicRow),'family_id','auth_user_id','storage_key'])assert.ok(q.has(field));assert.match(q.get('notes'),/\\"quoted\\"/);
 assert.deepEqual(flow.healthDocumentDeleteInput(delBody,id,scope),{scope,document:publicRow});assert.throws(()=>flow.healthDocumentDeleteInput({...delBody,expectedScope:{...scope,actorId:'other'}},id,scope));
});
test('upload confirms object and exact scoped metadata before audit; no raw storage field in acknowledgement',async()=>{
 const order=[];const result=await flow.uploadHealthDocument(upload({put:async()=>{order.push('put');return{key,size:png.length};},create:async()=>{order.push('record');return[row];},audit:async()=>order.push('audit'),discardUnlinked:async()=>order.push('discard')}));assert.deepEqual(order,['put','record','audit']);assert.equal(flow.healthDocumentAcknowledged('/api/health/upload','POST',form(),201,result),true);assert.deepEqual(result.document,publicRow);
});
test('lost/malformed/empty/mismatched metadata reply NEVER deletes a potentially saved object or audits',async()=>{
 for(const create of [async()=>{throw Error('lost after commit');},async()=>{throw{status:408};},async()=>{throw{status:502};},async()=>[],async()=>null,async()=>[row,row],async()=>[{...row,auth_user_id:'other'}],async()=>[{...row,title:'other'}]]){let calls=0;await assert.rejects(flow.uploadHealthDocument(upload({create,discardUnlinked:async()=>calls++,audit:async()=>calls++})),e=>e.code==='HEALTH_DOC_UNKNOWN');assert.equal(calls,0);}
});
test('known rejection or put failure discards only unlinked object; cleanup failure is retained for support, no blind replay',async()=>{
 const order=[];await assert.rejects(flow.uploadHealthDocument(upload({create:async()=>{order.push('insert');throw{status:409};},discardUnlinked:async()=>order.push('discard')})),e=>e.code==='HEALTH_DOC_REJECTED');assert.deepEqual(order,['insert','discard']);
 let creates=0;await assert.rejects(flow.uploadHealthDocument(upload({put:async()=>null,create:async()=>creates++,discardUnlinked:async()=>{throw Error('cleanup outage');}})),e=>e.code==='HEALTH_DOC_UNLINKED_PENDING'&&e.operationId===id);assert.equal(creates,0);
 await assert.rejects(flow.uploadHealthDocument(upload({put:async()=>{throw Error('put outage');}})),e=>e.code==='HEALTH_DOC_STORAGE_WRITE');
});
test('delete requires exact old own metadata and returned row before object cleanup/audit',async()=>{
 const order=[];const result=await flow.deleteHealthDocument(remove({removeRecord:async q=>{order.push('record');assert.equal(q.get('storage_key'),'eq."'+key+'"');return[row];},removeUnreferencedObject:async captured=>{order.push('object');assert.equal(captured,key);},audit:async()=>order.push('audit')}));assert.deepEqual(order,['record','object','audit']);assert.equal(flow.healthDocumentAcknowledged(delPath,'DELETE',delBody,200,result),true);assert.equal(Object.hasOwn(result,'document'),false);
 for(const expected of [{...publicRow,title:'changed'},{...publicRow,created_at:'2026-10-14T09:00:00.123455Z'}])await assert.rejects(flow.deleteHealthDocument(remove({expected})),e=>e.code==='HEALTH_DOC_CHANGED');
});
test('empty/lost/malformed/wrong-key delete never removes storage or writes phantom audit',async()=>{
 for(const [removeRecord,code]of [[async()=>[],'HEALTH_DOC_CHANGED'],[async()=>null,'HEALTH_DOC_UNKNOWN'],[async()=>[row,row],'HEALTH_DOC_UNKNOWN'],[async()=>[{...row,storage_key:key+'x'}],'HEALTH_DOC_UNKNOWN'],[async()=>{throw Error('lost');},'HEALTH_DOC_UNKNOWN'],[async()=>{throw{status:400};},'HEALTH_DOC_REJECTED']]){let calls=0;await assert.rejects(flow.deleteHealthDocument(remove({removeRecord,removeUnreferencedObject:async()=>calls++,audit:async()=>calls++})),e=>e.code===code);assert.equal(calls,0);}
});
test('confirmed upload/delete audit/storage failure yields explicit pending, not failed mutation',async()=>{
 const u=await flow.uploadHealthDocument(upload({audit:async()=>{throw Error('audit');}}));assert.equal(u.auditPending,true);assert.equal(flow.healthDocumentAcknowledged('/api/health/upload','POST',form(),202,u),true);
 for(const failure of ['storage','audit','both']){const r=await flow.deleteHealthDocument(remove({removeUnreferencedObject:async()=>{if(failure!=='audit')throw Error('storage');},audit:async()=>{if(failure!=='storage')throw Error('audit');}}));assert.equal(flow.healthDocumentAcknowledged(delPath,'DELETE',delBody,202,r),true);assert.equal(flow.healthDocumentAcknowledged(delPath,'DELETE',delBody,200,r),false);}
});
test('strict acknowledgement rejects wrong scope/ID/data/private flags and stale or malformed success',async()=>{
 const r=await flow.uploadHealthDocument(upload());for(const patch of [{success:'true'},{auditPending:'false'},{cleanupPending:true},{scope:{...scope,actorId:'other'}},{document:{...r.document,title:'other'}},{document:{...r.document,auth_user_id:actor}},{id:family},{outcomeUnknown:true}])assert.equal(flow.healthDocumentAcknowledged('/api/health/upload','POST',form(),201,{...r,...patch}),false);
 const d=await flow.deleteHealthDocument(remove());assert.equal(flow.healthDocumentAcknowledged(delPath,'DELETE',delBody,200,{...d,id:family}),false);assert.equal(flow.healthDocumentAcknowledged(delPath,'DELETE',delBody,200,{...d,document:publicRow}),false);
});
test('client preserves cancellation/rejection/unknown and typed bilingual confirmation/result copy without retries',async()=>{
 for(const [status,payload,kind]of [[499,{},'cancelled'],[400,{code:'HEALTH_DOC_INPUT'},'rejected'],[503,{code:'HEALTH_DOC_STORAGE'},'rejected'],[503,{code:'HEALTH_DOC_UNLINKED_PENDING'},'unknown'],[503,{},'unknown'],[413,{},'rejected'],[201,{},'unknown']]){let calls=0;const r=await flow.readHealthDocumentMutation(async()=>{calls++;return Response.json(payload,{status});},'/api/health/upload','POST',form());assert.equal(r.kind,kind);assert.equal(calls,1);}
 for(const locale of ['bn','en'])for(const [path,method]of [['/api/health/upload','POST'],[delPath,'DELETE']]){assert.ok(flow.healthDocumentActionCopy(path,method,locale));assert.equal(flow.healthDocumentFeedback(path,503,{},locale,method).kind,'info');assert.ok(flow.healthDocumentCopy('HEALTH_DOC_PENDING',locale));}assert.equal(flow.healthDocumentFeedback(delPath,200,{},'en','GET'),null);
});

function harness(options={}){
 const db=[],objects=new Map(),calls=[];let memberReads=0;
 class RestError extends Error{constructor(status){super('Synthetic rejection');this.status=status;}}
 const bucket={put:async(k,stream,meta)=>{calls.push('put');const bytes=new Uint8Array(await new Response(stream).arrayBuffer());objects.set(k,{key:k,size:bytes.length,httpMetadata:meta.httpMetadata,body:bytes,httpEtag:'"QA"'});return objects.get(k);},get:async k=>{calls.push('get-object');return objects.get(k)??null;},delete:async k=>{calls.push('delete-object');if(options.cleanupFail)throw Error('storage');objects.delete(k);}};
 const rest=async(path,init={})=>{const [table,query='']=path.split('?'),method=init.method??'GET',q=new URLSearchParams(query);calls.push(table+':'+method);
  if(table==='audit_logs'){if(options.auditFail)throw Error('audit');return[{id,...JSON.parse(init.body)}];}
  assert.equal(table,'health_documents');
  const selected=db.filter(row=>[...q].every(([k,v])=>{if(['select','limit'].includes(k))return true;if(v==='is.null')return row[k]===null;let expected=v.slice(3);if(expected.startsWith('"'))expected=expected.slice(1,-1).replace(/\\(.)/g,'$1');return String(row[k])===expected;}));
  if(method==='GET')return structuredClone(selected);
  if(method==='POST'){if(options.metadataRejected)throw new RestError(409);const r={...JSON.parse(init.body),created_at:stamp};db.push(r);if(options.metadataLost)throw Error('lost insert response');return[structuredClone(r)];}
  if(method==='DELETE'){for(const r of selected)db.splice(db.indexOf(r),1);if(options.deleteLost)throw Error('lost delete response');return structuredClone(selected);}
  throw Error('Unexpected REST method');
 };
 const deps={'cloudflare:workers':{env:{BUCKET:options.noStorage?undefined:bucket}},'@/app/chatgpt-auth':{getChatGPTUser:async()=>options.unsigned?null:{userId:actor}},'@/lib/family-access':{getActiveFamilyMembership:async()=>{memberReads++;return options.revoke&&memberReads>1?null:{family_id:family,role:'owner'};}},'@/lib/supabase-rest':{supabaseRest:rest,SupabaseRequestError:RestError,BackendNotConfiguredError:class extends Error{}},'@/lib/health-document-workflow':flow,'@/lib/health-validation':validation,'../route':{healthErrorResponse:()=>Response.json({error:'Synthetic error'},{status:500})}};
 const load=file=>{const output=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};new Function('exports','require',output)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];});return exports;};
 return{db,objects,calls,upload:load('app/api/health/upload/route.ts').POST,document:load('app/api/health-document/[id]/route.ts')};
}
const uploadRequest=f=>new Request('http://localhost/api/health/upload',{method:'POST',body:f});
test('actual handlers simulate upload/private read/delete, public acknowledgement and exact object lifecycle',async()=>{
 const h=harness(),created=await h.upload(uploadRequest(form())),p=await created.json();assert.equal(created.status,201);assert.equal(flow.healthDocumentAcknowledged('/api/health/upload','POST',form(),201,p),true);assert.equal(h.objects.size,1);
 const context={params:Promise.resolve({id:p.id})};const read=await h.document.GET(new Request('http://localhost'),context);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await read.arrayBuffer()),png);
 const body={expectedScope:scope,expectedDocument:p.document},request=new Request('http://localhost',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),removed=await h.document.DELETE(request,context),result=await removed.json();assert.equal(removed.status,200);assert.equal(flow.healthDocumentAcknowledged('/api/health-document/'+p.id,'DELETE',body,200,result),true);assert.equal(h.db.length,0);assert.equal(h.objects.size,0);
});
test('actual handler simulations retain objects after committed-but-lost metadata/delete and return audit/cleanup pending',async()=>{
 for(const option of [{metadataLost:true},{metadataRejected:true},{auditFail:true}]){const h=harness(option),r=await h.upload(uploadRequest(form()));assert.equal(r.status,option.metadataLost?503:option.metadataRejected?409:202);assert.equal(h.objects.size,option.metadataRejected?0:1);if(option.metadataLost)assert.equal(h.calls.includes('delete-object'),false);}
 for(const option of [{deleteLost:true},{cleanupFail:true}]){const h=harness(option),r=await h.upload(uploadRequest(form())),p=await r.json(),removed=await h.document.DELETE(new Request('http://localhost',{method:'DELETE',body:JSON.stringify({expectedScope:scope,expectedDocument:p.document})}),{params:Promise.resolve({id:p.id})});assert.equal(removed.status,option.deleteLost?503:202);assert.equal(h.objects.size,1);assert.equal(h.db.length,0);if(option.deleteLost)assert.equal(h.calls.includes('delete-object'),false);}
});
test('actual handler context/input/header/auth rejection makes no storage or database mutation',async()=>{
 for(const [opts,f,status]of [[{},form({expectedActorId:'other'}),409],[{},form({title:'x'.repeat(181)}),400],[{},form({file:new File(['not PNG'],'qa.png',{type:'image/png'})}),400],[{unsigned:true},form(),401],[{noStorage:true},form(),503],[{revoke:true},form(),409]]){const h=harness(opts),r=await h.upload(uploadRequest(f));assert.equal(r.status,status);assert.equal(h.calls.length,0);assert.equal(h.objects.size,0);}
});
test('private file GET withholds bytes after metadata removal/change or final membership revocation',async()=>{
 for(const reason of ['removed','changed','revoked']){
  const h=harness(reason==='revoked'?{revoke:true}:{});
  h.db.push({...row});h.objects.set(key,{key,size:png.length,httpMetadata:{contentType:'image/png'},body:png,httpEtag:'"QA"'});
  if(reason==='removed'||reason==='changed'){
   const originalGet=h.objects.get.bind(h.objects);h.objects.get=k=>{const object=originalGet(k);if(reason==='removed')h.db.splice(0);else h.db[0].title='Changed during file read';return object;};
  }
  const r=await h.document.GET(new Request('http://localhost'),{params:Promise.resolve({id})});assert.equal(r.status,409);assert.equal(h.calls.some(c=>c==='delete-object'),false);assert.notDeepEqual(Buffer.from(await r.arrayBuffer()),png);
 }
});
test('private file GET rejects foreign-owner/cross-family/unsafe-key and mismatched object metadata before serving bytes',async()=>{
 for(const patch of [{auth_user_id:'other'},{family_id:id},{storage_key:'families/'+family+'/health/other/'+id+'.png'}]){const h=harness();h.db.push({...row,...patch});const r=await h.document.GET(new Request('http://localhost'),{params:Promise.resolve({id})});assert.equal(r.status,404);assert.equal(h.calls.includes('get-object'),false);}
 const h=harness();h.db.push({...row});h.objects.set(key,{key,size:png.length+1,httpMetadata:{contentType:'image/png'},body:png,httpEtag:'"QA"'});assert.equal((await h.document.GET(new Request('http://localhost'),{params:Promise.resolve({id})})).status,404);
});
test('UI and provider wire typed documents to cancellation, private scope, session lock and safe read cache',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),ui=read('app/health-center.tsx'),provider=read('components/action-modal-provider.tsx'),upload=read('app/api/health/upload/route.ts'),document=read('app/api/health-document/[id]/route.ts');assert.match(ui,/readHealthDocumentMutation/);assert.match(ui,/formData.set\("expectedActorId",captured.scope.actorId\)/);assert.match(ui,/expectedScope:captured.scope,expectedDocument/);assert.match(ui,/function acceptDocumentOutcome/);assert.match(provider,/healthDocumentResult/);assert.match(provider,/healthDocumentActionCopy/);assert.doesNotMatch(upload,/if \(uploadedKey\)/);assert.match(document,/private, no-store/);assert.match(document,/latest.auth_user_id/);assert.match(document,/removeUnreferencedObject/);
});
