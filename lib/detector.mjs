import model from '../data/model.json' with { type: 'json' };
export { model };
export function features(c) {
  if(!c || c.synthetic!==true || typeof c.id!=='string' || !c.id.startsWith('SYN-') || !Number.isFinite(c.asOf) || !Number.isInteger(c.workforce) || c.workforce<=0 || !Array.isArray(c.events)) return null;
  const types=['wage','amendment','employer_exclusion','supervisor_change','claim'];
  if(c.events.some(e=>!e || !types.includes(e.type) || !Number.isFinite(e.recordedAt) || typeof e.subject!=='string' || !e.subject.startsWith('SYN-')))return null;
  const es=c.events.filter(e=>Number.isFinite(e.recordedAt)&&e.recordedAt<=c.asOf);
  const am=es.filter(e=>e.type==='amendment'&&e.subject===c.id&&e.recordedAt>=c.asOf-30*86400000);
  const wages=es.filter(e=>e.type==='wage'&&e.subject===c.id).sort((a,b)=>a.recordedAt-b.recordedAt);
  if(!es.some(e=>e.type==='claim'&&e.subject===c.id))return null;
  if(wages.length<2 || wages.some(e=>!Number.isFinite(e.amount)||e.amount<=0) || am.some(e=>!Number.isFinite(e.effectiveAt))) return null;
  const x=[am.length,Math.max(0,...am.map(e=>(e.recordedAt-e.effectiveAt)/86400000)),Math.log1p(am.length?(c.asOf-Math.max(...am.map(e=>e.recordedAt)))/3600000:720),(wages.at(-1).amount/wages.at(-2).amount-1)*100,100*es.filter(e=>e.type==='employer_exclusion'&&e.recordedAt>=c.asOf-7*86400000).length/c.workforce,100*es.filter(e=>e.type==='supervisor_change'&&e.recordedAt>=c.asOf-86400000).length/c.workforce];
  return x.every(Number.isFinite)?x:null;
}
export function pathCorrection(n){return n<=1?0:n===2?1:2*(Math.log(n-1)+0.5772156649015329)-2*(n-1)/n;}
export function scoreVector(x){
  const v=x.map(Math.fround);
  const depths=model.trees.map(t=>{let i=0,d=0;while(t.left[i]!==-1){i=v[t.feature[i]]<=t.threshold[i]?t.left[i]:t.right[i];d++;}return d+pathCorrection(t.samples[i]);});
  return 2**(-depths.reduce((a,b)=>a+b,0)/model.trees.length/pathCorrection(model.maxSamples));
}
export function assess(c){
  const x=features(c);
  if(!x) return {modelVersion:model.version,complete:false,route:'Complete evidence',band:'Incomplete',percentile:null,reasons:['Required workforce or event evidence is missing. No model score was produced.'],features:[]};
  const score=scoreVector(x), percentile=100*model.calibrationScores.filter(v=>v<=score).length/model.calibrationScores.length;
  const rules=[];
  if(x[0]>=4)rules.push('Four or more claimant amendments in 30 days');
  if(x[1]>=30)rules.push('Backdating of 30 days or more');
  if(x[3]>=80)rules.push('Wage increase of 80% or more');
  if(x[4]>=35)rules.push('Employer exclusion rate of 35% or more');
  if(x[5]>=20)rules.push('Supervisor change rate of 20% or more');
  const flagged=score>=model.threshold;
  const evidence=x.map((v,i)=>({name:model.features[i],value:i===2?Math.expm1(v):v,median:i===2?Math.expm1(model.referenceMedian[i]):model.referenceMedian[i],low:i===2?Math.expm1(model.referenceP05[i]):model.referenceP05[i],high:i===2?Math.expm1(model.referenceP95[i]):model.referenceP95[i],unusual:v<model.referenceP05[i]||v>model.referenceP95[i]}));
  return {modelVersion:model.version,complete:true,score,percentile,modelFlagged:flagged,ruleFlagged:rules.length>0,ruleReasons:rules,route:rules.length||flagged?'Specialist review':'Standard review',band:rules.length||flagged?'Review':'Typical',features:evidence,reasons:[flagged?'The trained forest finds this combination unusual relative to its synthetic reference population.':'The trained forest did not flag this combination at the selected threshold.',...rules],explanationBoundary:'Feature ranges provide context, not causal explanations or exact model contributions.'};
}
