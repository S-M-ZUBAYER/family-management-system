import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import ts from 'typescript';
import * as reads from '../lib/welfare-read.ts';import * as visibility from '../lib/welfare-visibility.ts';import * as documentUpload from '../lib/welfare-document-upload.ts';import * as pagination from '../lib/paginated-rows.ts';import * as outcomes from '../lib/welfare-write-outcome.ts';import * as copy from '../lib/welfare-error-copy.ts';
const {welfareReadSnapshot,welfareSameScope,welfareSnapshotLedger,WelfareReadGate,WelfareReadError,readWelfare,welfareReadCopy}=reads;
const family='20000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000090',actor='qa-owner',stamp='2026-10-14T08:00:00.000Z';
const base={family:{id:family,name_bn:'QA পরিবার',name_en:'QA Family'},scope:{familyId:family,actorId:actor},viewer:{displayName:'QA Owner',role:'owner'},funds:[],contributions:[],expenses:[],requests:[],pledges:[],documents:[],permissions:{canManage:true},migrationRequired:false};
const fund={id,name:'QA fund',description:null,category:'general',target_amount:'100.00',opening_balance:'0.10',status:'active',visibility:'family',created_at:stamp,updated_at:stamp};
const contribution={id,fund_id:id,contributor_user_id:actor,contributor_name:'QA Owner',amount:'0.20',contribution_date:'2026-10-14',payment_method:'cash',reference:null,notes:null,status:'approved',approved_by_name:null,approved_at:null,created_at:stamp,is_mine:true};
const expense={id,fund_id:id,linked_request_id:null,title:'QA expense',beneficiary_name:null,category:'other',amount:'0.15',expense_date:'2026-10-14',payment_method:'cash',reference:null,notes:null,status:'paid',approved_by_name:null,approved_at:null,paid_at:null,created_at:stamp};
const request={id,fund_id:id,requester_user_id:actor,requester_name:'QA Owner',request_type:'medical',title:'QA request',description:'Synthetic only',requested_amount:'10.00',approved_amount:'0.00',urgency:'normal',visibility:'admins',status:'submitted',admin_note:null,reviewed_by_name:null,reviewed_at:null,created_at:stamp,updated_at:stamp,is_mine:true};
const pledge={id,fund_id:id,auth_user_id:actor,member_name:'QA Owner',frequency:'monthly',amount:'1.00',start_date:'2026-10-14',next_due_date:null,status:'active',notes:null,created_at:stamp,updated_at:stamp,is_mine:true};
const doc={id,entity_type:'contribution',entity_id:id,document_type:'receipt',title:'QA receipt',file_name:'qa.pdf',mime_type:'application/pdf',file_size:5,visibility:'admins',uploaded_by_name:'QA Owner',created_at:stamp,can_view:true,is_mine:true};
const full={...base,funds:[fund],contributions:[contribution],expenses:[expense],requests:[request],pledges:[pledge],documents:[doc]};
const member={...full,viewer:{...base.viewer,role:'member'},permissions:{canManage:false}};
test('complete empty/populated/migration snapshots validate scope, money, permissions and ownership flags',()=>{
 for(const p of [base,full,member,{...base,migrationRequired:true},{...base,family:{...base.family,name_en:''}}])assert.ok(welfareReadSnapshot(p));
 for(const p of [null,{}, {...base,scope:null},{...base,scope:{...base.scope,familyId:id}},{...base,scope:{...base.scope,actorId:''}},{...base,viewer:{...base.viewer,role:'admin'}},{...base,permissions:{canManage:false}},{...base,permissions:{canManage:'true'}},{...full,migrationRequired:true}])assert.equal(welfareReadSnapshot(p),null);
});
test('every required array/type/date/status/key is checked; duplicate IDs and storage/database leakage fail closed',()=>{
 for(const section of ['funds','contributions','expenses','requests','pledges','documents']){
  for(const rows of [undefined,{},[{}],[...full[section],...full[section]],[{...full[section][0],created_at:'bad'}],[{...full[section][0],storage_key:'private'}],[{...full[section][0],family_id:family}]])assert.equal(welfareReadSnapshot({...full,[section]:rows}),null,section);
 }
 for(const [section,key,value]of [['funds','status','unknown'],['contributions','amount','0.001'],['expenses','amount',true],['requests','approved_amount',-1],['pledges','next_due_date','2026-10-13'],['documents','can_view',false],['documents','file_size',0],['documents','mime_type','text/html'],['contributions','is_mine',false],['requests','requester_user_id','other'],['pledges','auth_user_id','other']])assert.equal(welfareReadSnapshot({...full,[section]:[{...full[section][0],[key]:value}]}),null);
});
test('member privacy allows own hidden-fund records but rejects hidden funds/nonown drafts/private receipts/other pledges',()=>{
 assert.ok(welfareReadSnapshot({...member,funds:[],expenses:[]}));
 for(const patch of [{funds:[{...fund,visibility:'admins'}]},{contributions:[{...contribution,contributor_user_id:'other',is_mine:false,status:'pending'}]},{expenses:[{...expense,status:'pending'}]},{requests:[{...request,requester_user_id:'other',is_mine:false}]},{pledges:[{...pledge,auth_user_id:'other',is_mine:false}]},{documents:[{...doc,is_mine:false}]}])assert.equal(welfareReadSnapshot({...member,...patch}),null);
 assert.ok(welfareReadSnapshot({...member,requests:[{...request,requester_user_id:'other',is_mine:false,visibility:'family',status:'approved'}],pledges:[]}));
});
test('own history for a hidden fund cannot inflate visible fund available balance; own pledge remains separate',()=>{
 assert.equal(welfareSnapshotLedger(full).balance,0.15);
 const hidden={...member,funds:[],expenses:[]};assert.ok(welfareReadSnapshot(hidden));assert.deepEqual(welfareSnapshotLedger(hidden),{approvedIncome:0,paidExpense:0,openingBalance:0,balance:0,myPledge:1});
});
test('visible parent links are required; safe historic hidden linked requests are not falsely exposed',()=>{
 assert.equal(welfareReadSnapshot({...full,funds:[]}),null);assert.equal(welfareReadSnapshot({...full,contributions:[]}),null);assert.equal(welfareReadSnapshot({...full,documents:[{...doc,entity_id:family}]}),null);
 assert.ok(welfareReadSnapshot({...member,expenses:[{...expense,linked_request_id:family}]}));
});
test('row limits and aggregate precision fail instead of silently showing partial balances',()=>{
 const rows=Array.from({length:20000},(_,i)=>({...fund,id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0'),opening_balance:0}));assert.ok(welfareReadSnapshot({...base,funds:rows}));assert.equal(welfareReadSnapshot({...base,funds:[...rows,fund]}),null);
 assert.equal(welfareReadSnapshot({...base,funds:rows.map(r=>({...r,opening_balance:'999999999999.99'}))}),null);
});
test('one read classifies auth/setup/context/limit/invalid/backend failures without automatic retry',async()=>{
 assert.deepEqual(await readWelfare(async()=>Response.json(full)),full);
 for(const [status,p,code]of [[401,{},'WELFARE_READ_SIGN_IN'],[403,{},'WELFARE_READ_ACCESS'],[413,{},'WELFARE_ROW_LIMIT'],[409,{code:'FAMILY_SETUP_REQUIRED'},'WELFARE_READ_SETUP'],[409,{},'WELFARE_READ_CONTEXT'],[502,{},'WELFARE_READ_FAILED'],[200,{},'WELFARE_READ_INVALID']]){let calls=0;await assert.rejects(readWelfare(async init=>{calls++;assert.equal(init.cache,'no-store');return Response.json(p,{status});}),e=>e.code===code);assert.equal(calls,1);}
 await assert.rejects(readWelfare(async()=>new Response('bad JSON')),WelfareReadError);await assert.rejects(readWelfare(async()=>{throw Error('offline');}),WelfareReadError);
});
test('real deadline bounds fetch and JSON even if adapters ignore abort',async()=>{
 for(const read of [async()=>new Promise(()=>{}),async()=>({status:200,ok:true,json:()=>new Promise(()=>{})})])await assert.rejects(readWelfare(read,undefined,10),e=>e.code==='WELFARE_READ_TIMEOUT');
});
test('superseded/unmounted requests cannot publish late data; pre-aborted reads do not fetch',async()=>{
 const gate=new WelfareReadGate(),old=gate.begin();let calls=0;
 const pending=readWelfare(async()=>new Promise(()=>{}),old.controller.signal);const current=gate.begin();assert.equal(gate.current(old),false);assert.equal(gate.current(current),true);await assert.rejects(pending,e=>e.code==='WELFARE_READ_SUPERSEDED');gate.invalidate();assert.equal(gate.current(current),false);
 await assert.rejects(readWelfare(async()=>{calls++;return Response.json(full);},old.controller.signal),e=>e.code==='WELFARE_READ_SUPERSEDED');assert.equal(calls,0);
});
test('fresh export/summary context requires the same family actor AND role; bilingual errors remain specific',()=>{
 assert.equal(welfareSameScope(full,structuredClone(full)),true);
 for(const p of [{...full,scope:{...base.scope,actorId:'other'}},{...full,scope:{...base.scope,familyId:id}},member])assert.equal(welfareSameScope(full,p),false);
 for(const locale of ['bn','en'])for(const code of ['WELFARE_READ_TIMEOUT','WELFARE_READ_INVALID','WELFARE_READ_CONTEXT','WELFARE_READ_ACCESS','WELFARE_ROW_LIMIT'])assert.ok(welfareReadCopy(code,locale));
});
function harness({role='owner',change=false,bad=false,missing=false,migration=false,tooMany=false,anonymous=false}={}){
 let memberships=0;const calls=[];
 class BackendError extends Error{}class RequestError extends Error{constructor(){super('PGRST205 synthetic missing table');this.status=404;}}
 const raw={welfare_funds:[fund],welfare_contributions:[contribution],welfare_expenses:[expense],welfare_requests:[request],welfare_pledges:[pledge],welfare_documents:[{...doc,uploaded_by_user_id:actor}]};
 const rest=async path=>{const [table,query]=path.split('?'),q=new URLSearchParams(query);calls.push({table,q});if(table==='families')return missing?[]:[base.family];assert.equal(q.get('family_id'),'eq.'+family);if(migration)throw new RequestError();if(tooMany)throw new pagination.PaginatedRowLimitError(20000);
 const rows=raw[table];assert.ok(rows);const projected=rows.map(r=>Object.fromEntries(q.get('select').split(',').map(k=>[k,r[k]])));if(bad&&table==='welfare_funds')projected[0].opening_balance='bad';return projected;};
 const deps={'@/app/chatgpt-auth':{getChatGPTUser:async()=>anonymous?null:({userId:actor,displayName:'QA Owner'})},'@/lib/family-access':{getActiveFamilyMembership:async()=>({id:family,family_id:family,role:change&&++memberships>1?'member':role}),canManageWelfare:r=>r!=='member'},'@/lib/paginated-rows':pagination,'@/lib/supabase-rest':{supabaseRest:rest,isBackendConfigured:()=>true,BackendNotConfiguredError:BackendError,SupabaseRequestError:RequestError},'@/lib/welfare-visibility':visibility,'@/lib/welfare-document-upload':documentUpload,'@/lib/welfare-write-outcome':outcomes,'@/lib/welfare-error-copy':copy,'@/lib/welfare-read':reads};
 const exp={},source=readFileSync(new URL('../app/api/welfare/route.ts',import.meta.url),'utf8');new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exp,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];});
 return{read:exp.GET,calls};
}
test('actual GET handler with memory adapter validates complete owner/member projections and scopes without any writes',async()=>{
 for(const role of ['owner','family_admin','manager','member']){const h=harness({role}),r=await h.read(),p=await r.json();assert.equal(r.status,200);assert.ok(welfareReadSnapshot(p));assert.equal(p.scope.actorId,actor);assert.equal(p.permissions.canManage,role!=='member');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(h.calls.length,7);}
});
test('actual GET rejects membership changes, invalid ledger/missing family and reports empty migration explicitly',async()=>{
 for(const [options,status,code]of [[{change:true},409,'WELFARE_READ_CONTEXT'],[{bad:true},502,'WELFARE_READ_INVALID'],[{missing:true},502,'WELFARE_READ_INVALID'],[{tooMany:true},413,'WELFARE_ROW_LIMIT']]){const h=harness(options),r=await h.read();assert.equal(r.status,status);assert.equal((await r.json()).code,code);assert.equal(r.headers.get('cache-control'),'no-store');}
 const h=harness({migration:true}),r=await h.read(),p=await r.json();assert.equal(r.status,200);assert.equal(p.migrationRequired,true);assert.ok(welfareReadSnapshot(p));for(const s of ['funds','contributions','expenses','requests','pledges','documents'])assert.deepEqual(p[s],[]);
 const anon=harness({anonymous:true});assert.equal((await anon.read()).status,401);assert.equal(anon.calls.length,0);
});
test('UI read/Retry/export/summary wiring clears first, uses fresh scoped data, and disables portal editing',()=>{
 const ui=readFileSync(new URL('../app/welfare-center.tsx',import.meta.url),'utf8');assert.equal(ts.createSourceFile('welfare-center.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);
 assert.match(ui,/snapshotRef.current = null/);assert.match(ui,/clearLoadedWelfare\(\);\s*try/);assert.match(ui,/\}, \[setFeedback, setKind, setEditingRecord, setForm, setUploadOpen, setUploadFile, setUploadForm\]\)/);assert.equal(ui.includes('payload.funds ?? []'),false);assert.equal(ui.includes('Boolean(payload.permissions'),false);assert.match(ui,/welfareExportRows\(fresh, exportLocale/);assert.match(ui,/welfareSameScope\(source, fresh\)/);assert.match(ui,/snapshotRef.current === source/);assert.match(ui,/exportGate.current.invalidate\(\)/);assert.match(ui,/localeRef.current/);assert.match(ui,/Refresh data/);assert.match(ui,/Retry/);assert.equal((ui.match(/<fieldset disabled=\{saving \|\| exporting\}/g)||[]).length,2);assert.match(ui,/writeBusy.current = value/);assert.match(ui,/welfareSnapshotLedger\(fresh\)/);
});
