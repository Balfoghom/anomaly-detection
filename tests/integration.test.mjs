import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createInferenceServer} from '../server.mjs';
import cases from '../data/cases.json' with {type:'json'};
import evaluationCases from '../data/evaluation-cases.json' with {type:'json'};
import evaluation from '../data/evaluation.json' with {type:'json'};
import {assess,features,scoreVector,model} from '../lib/detector.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
test('model artifact matches the evaluation fingerprint',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../data/model.json',import.meta.url))).digest('hex'),evaluation.artifactSha256));
test('all 600 held-out scores match Python and reproduce the reported metrics',()=>{
 const counts={tp:0,fp:0,fn:0,tn:0};
 for(const c of evaluationCases){const s=scoreVector(c.features);assert.ok(Math.abs(s-c.pythonScore)<1e-10);const p=s>=model.threshold;counts[c.expectedReview?(p?'tp':'fn'):(p?'fp':'tn')]++;}
 for(const k of Object.keys(counts))assert.equal(counts[k],evaluation.metrics['Isolation Forest only'][k]);
});
test('partial missing or malformed evidence cannot silently produce a model score',()=>{
 for(const change of [c=>c.events[0].recordedAt=null,c=>c.workforce=-1,c=>c.synthetic=false,c=>c.events=c.events.filter(e=>e.type!=='claim'),c=>c.events.find(e=>e.type==='wage').amount=0]){
  const c=structuredClone(cases[0]);change(c);assert.equal(features(c),null);assert.equal(assess(c).complete,false);
 }
});
test('chronological sorting is independent of input order',()=>{const c=structuredClone(cases[0]);const before=features(c);c.events.reverse();assert.deepEqual(features(c),before)});
test('future backdated amendments cannot leak into current scoring',()=>{const c=structuredClone(cases[0]);const before=assess(c).score;c.events.push({type:'amendment',subject:c.id,recordedAt:c.asOf+1,effectiveAt:c.asOf-90*86400000});assert.equal(assess(c).score,before)});
test('local API serves real inference and refuses arbitrary records',async t=>{
 const server=createInferenceServer();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));const url=`http://127.0.0.1:${server.address().port}`;
 const post=body=>fetch(url+'/assess',{method:'POST',body:JSON.stringify(body)});
 assert.equal((await fetch(url+'/health')).status,200);
 const r=await post({case_id:cases[2].id});assert.equal(r.status,200);const j=await r.json();assert.equal(j.score,assess(cases[2]).score);assert.equal(j.modelFlagged,true);assert.equal(j.ruleFlagged,false);
 assert.equal((await post({case_id:'REAL-123'})).status,404);
 assert.equal((await post({case_id:cases[0].id,events:[]})).status,400);
 assert.equal((await post(null)).status,400);
 const incomplete=await (await post({case_id:cases[5].id})).json();assert.equal(incomplete.percentile,null);
});
