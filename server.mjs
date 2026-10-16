/** Local integration adapter. Hosted access controls belong to the application's server. */
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import cases from './data/cases.json' with {type:'json'};
import report from './data/evaluation.json' with {type:'json'};
import {assess,model} from './lib/detector.mjs';
export function createInferenceServer(){return createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&path==='/health')return send(200,{status:'ready',modelVersion:model.version,syntheticOnly:true});
  if(req.method==='GET'&&path==='/model')return send(200,{version:model.version,algorithm:model.algorithm,features:model.features,trees:model.trees.length,threshold:model.threshold,trainingHistories:model.trainCount,calibrationHistories:model.calibrationCount,artifactSha256:report.artifactSha256,validation:report.validation});
  if(req.method==='GET'&&path==='/cases')return send(200,cases.map(c=>({id:c.id,scenario:c.family,events:c.events.length,synthetic:true})));
  if(req.method==='POST'&&path==='/assess'){
    let payload='';
    try{
      for await(const chunk of req){payload+=chunk;if(Buffer.byteLength(payload)>2048)return send(413,{error:'Request too large. Send a synthetic case ID only.'});}
      const b=JSON.parse(payload);
      if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>k!=='case_id')||typeof b.case_id!=='string')return send(400,{error:'Expected only {case_id: supplied synthetic ID}.'});
      const c=cases.find(c=>c.id===b.case_id);
      if(!c)return send(404,{error:'Synthetic case not found. Arbitrary records are not accepted.'});
      return send(200,{assessmentId:crypto.randomUUID(),assessedAt:new Date().toISOString(),caseId:c.id,synthetic:true,validation:'Business validation pending',...assess(c)});
    }catch{return send(400,{error:'Invalid request JSON.'});}
  }
  return send(404,{error:'Not found'});
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.SANED_AI_PORT||8787);createInferenceServer().listen(port,'127.0.0.1',()=>console.log(`SANED inference ready at http://127.0.0.1:${port}. Synthetic IDs only.`));}
