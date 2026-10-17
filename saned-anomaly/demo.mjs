import cases from './data/cases.json' with {type:'json'};
import {assess} from './inference/detector.mjs';
import {writeFileSync} from 'node:fs';
const output=cases.slice(0,6).map(c=>({caseId:c.id,scenario:c.family,synthetic:true,validation:'Haitham review pending',...assess(c)}));
console.table(output.map(r=>({case:r.caseId,scenario:r.scenario,AI:r.complete?(r.modelFlagged?'flagged':'not flagged'):'abstained',rules:r.complete?(r.ruleFlagged?'triggered':'not triggered'):'not assessed',percentile:r.percentile?.toFixed(1)??'none',route:r.route})));
writeFileSync(new URL('./examples/demo-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log('Detailed evidence written to examples/demo-results.json. Percentiles are not fraud probabilities.');
