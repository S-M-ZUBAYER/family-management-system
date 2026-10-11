// Read-only loopback mock-owner acceptance; never creates a fixture.
import assert from 'node:assert/strict';
import { magazineReadSnapshot } from '../lib/magazine-read.ts';
const origin=new URL(process.env.FMS_QA_ORIGIN??'http://localhost:5173');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(origin.hostname));
const families=['20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'];
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function read(family,signed=true){const response=await fetch(new URL('/api/magazine',origin),{signal:AbortSignal.timeout(30000),headers:signed?{Cookie:`__sites_local_auth=1; fms_active_family=${family}`}:{}});eq(response.status,signed?200:401);const payload=await response.json();if(signed){magazineReadSnapshot(payload,family);checks++;}return payload;}
const allowed={articles:['id','title','summary','content','category','tags','visibility','status','featured','published_at','author_name','created_at','updated_at','reaction_count','comment_count','reacted_by_me','is_mine'],comments:['id','article_id','body','author_name','status','created_at','is_mine'],media:['id','article_id','media_type','file_name','mime_type','file_size','created_at']};
await read(families[0],false);
const counts=[];
for(const family of families){
 const before=await read(family);eq(before.family.id,family);eq(before.permissions.canManage,true);eq(before.migrationRequired,false);
 const ids=new Set(before.articles.map(x=>x.id));
 for(const [collection,keys]of Object.entries(allowed))for(const row of before[collection]){eq(Object.keys(row).sort(),[...keys].sort());if(collection!=='articles')eq(ids.has(row.article_id),true);}
 for(const key of ['author_user_id','uploaded_by_user_id','storage_key','user_id']){const walk=value=>{if(value&&typeof value==='object'){eq(Object.hasOwn(value,key),false);for(const child of Object.values(value))walk(child);}};walk({articles:before.articles,comments:before.comments,media:before.media});}
 const after=await read(family);for(const key of Object.keys(allowed))eq(after[key],before[key]);
 counts.push({family,articles:before.articles.length,comments:before.comments.length,media:before.media.length});
}
console.log(JSON.stringify({checks,readOnly:true,mockOwnerOnly:true,counts}));
