import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { projectMagazineRows } from '../lib/magazine-projection.ts';
import { magazineErrorCopy } from '../lib/magazine-validation.ts';
const stamp='2026-10-11T08:00:00Z';
const article=(id,author='other',status='published',visibility='family')=>({id,author_user_id:author,title:id,summary:null,content:'Synthetic magazine story for privacy tests.',category:'story',tags:['QA'],status,visibility,featured:false,published_at:status==='published'?stamp:null,author_name:'QA Author',created_at:stamp,updated_at:stamp,family_id:'private-family',storage_key:'private-key',unknown:'do not expose'});
const comment=(id,parent,author='other',status='visible')=>({id,article_id:parent,author_user_id:author,body:id,author_name:'QA Reader',status,created_at:stamp,family_id:'private-family',unknown:'do not expose'});
const media=(id,parent)=>({id,article_id:parent,media_type:'cover',file_name:'QA.png',mime_type:'image/png',file_size:68,created_at:stamp,storage_key:'private-key',uploaded_by_user_id:'private-uploader',family_id:'private-family'});
const rows=()=>({articles:[article('published'),article('draft','other','draft'),article('pending','other','pending'),article('archived','other','archived'),article('admin','other','published','admins'),article('mine','viewer','draft','admins')],comments:[comment('shown','published'),comment('hidden','published','other','hidden'),comment('hidden-mine','published','viewer','hidden'),comment('private-parent','draft'),comment('orphan','missing')],media:[media('cover','published'),media('private','draft'),media('mine-cover','mine'),media('orphan','missing')],reactions:[{article_id:'published',user_id:'other'},{article_id:'published',user_id:'viewer'},{article_id:'draft',user_id:'viewer'},{article_id:'missing',user_id:'viewer'}]});
test('member sees only published family articles plus own records, without inaccessible children',()=>{
 const result=projectMagazineRows(rows(),'viewer',false);
 assert.deepEqual(result.articles.map(x=>x.id),['published','mine']);
 assert.deepEqual(result.comments.map(x=>x.id),['shown','hidden-mine']);
 assert.deepEqual(result.media.map(x=>x.id),['cover','mine-cover']);
 assert.equal(result.articles[0].reaction_count,2);assert.equal(result.articles[0].comment_count,1);assert.equal(result.articles[0].reacted_by_me,true);assert.equal(result.articles[0].is_mine,false);assert.equal(result.articles[1].is_mine,true);assert.equal(result.comments[1].is_mine,true);
});
test('management projection retains all existing statuses/admin-only articles and hidden comments',()=>{
 const result=projectMagazineRows(rows(),'viewer',true);
 assert.equal(result.articles.length,6);assert.deepEqual(result.comments.map(x=>x.id),['shown','hidden','hidden-mine','private-parent']);assert.deepEqual(result.media.map(x=>x.id),['cover','private','mine-cover']);
 assert.equal(result.articles.find(x=>x.id==='draft').reaction_count,1);assert.equal(result.articles[0].comment_count,1);
});
test('explicit allowlists strip account, uploader, storage, family and unknown fields for every collection',()=>{
 const result=projectMagazineRows(rows(),'viewer',true);
 const articleKeys=['id','title','summary','content','category','tags','visibility','status','featured','published_at','author_name','created_at','updated_at','reaction_count','comment_count','reacted_by_me','is_mine'].sort();
 const commentKeys=['id','article_id','body','author_name','status','created_at','is_mine'].sort();
 const mediaKeys=['id','article_id','media_type','file_name','mime_type','file_size','created_at'].sort();
 for(const [collection,keys] of [[result.articles,articleKeys],[result.comments,commentKeys],[result.media,mediaKeys]])for(const row of collection)assert.deepEqual(Object.keys(row).sort(),keys);
 for(const marker of ['private-family','private-key','private-uploader','do not expose'])assert.ok(!JSON.stringify(result).includes(marker));assert.ok(!Object.hasOwn(result,'reactions'));
});
test('projection preserves order/text and does not modify database input arrays or shared tags',()=>{
 const source=rows(),snapshot=structuredClone(source),result=projectMagazineRows(source,'viewer',false);
 assert.deepEqual(source,snapshot);assert.equal(result.articles[0].content,source.articles[0].content);
 result.articles[0].tags.push('local-only');assert.deepEqual(source.articles[0].tags,['QA']);
 assert.deepEqual(projectMagazineRows({articles:[],comments:[],media:[],reactions:[]},'viewer',false),{articles:[],comments:[],media:[]});
});
test('linear aggregation retains counts and ownership for 20,000 synthetic article/child rows',()=>{
 const size=20000,source={articles:[],comments:[],media:[],reactions:[]};
 for(let i=0;i<size;i++){const id=String(i);source.articles.push(article(id));source.comments.push(comment('c'+id,id));source.media.push(media('m'+id,id));source.reactions.push({article_id:id,user_id:'viewer'});}
 const result=projectMagazineRows(source,'viewer',false);assert.equal(result.articles.length,size);assert.equal(result.comments.length,size);assert.equal(result.media.length,size);
 for(let i=0;i<size;i++){assert.equal(result.articles[i].id,String(i));assert.equal(result.articles[i].reaction_count,1);assert.equal(result.articles[i].comment_count,1);assert.equal(result.articles[i].reacted_by_me,true);}
});
test('BN/EN backend error codes and explicit error-result modal do not weaken auth or retry writes',()=>{
 for(const locale of ['bn','en'])for(const code of ['MAGAZINE_NOT_CONFIGURED','MAGAZINE_BACKEND_UNAVAILABLE','MAGAZINE_REQUEST_FAILED'])assert.ok(magazineErrorCopy(code,locale));
 const client=readFileSync(new URL('../app/magazine-center.tsx',import.meta.url),'utf8');assert.ok(client.includes('showResult({ kind: "error", title: pick("ম্যাগাজিন লোড হয়নি"'));assert.ok(client.includes('[locale, pick, showResult]'));
 const server=readFileSync(new URL('../app/api/magazine/route.ts',import.meta.url),'utf8');assert.ok(server.includes('projectMagazineRows('));assert.ok(server.includes('getActiveFamilyMembership(user.userId)'));assert.ok(!server.includes('...item'));assert.ok(!server.includes('storage_key'));assert.ok(!server.includes('uploaded_by_user_id'));assert.ok(!server.includes('reactions: reactions'));
 const types=readFileSync(new URL('../lib/magazine-types.ts',import.meta.url),'utf8');assert.ok(!types.includes('author_user_id'));
});
