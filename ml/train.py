"""Reproducible synthetic-only training. No outcome/ID enters the model."""
import json, math, hashlib
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest
import sklearn
OUT=Path(__file__).resolve().parents[1]/'data'
NAMES=['Amendments in 30 days','Maximum backdating (days)','Hours since last amendment','Wage change (%)','Employer exclusions / 100 workers','Supervisor changes / 100 workers']
T=1792022400000  # fixed synthetic assessment time, 15 October 2026

def generate(rng, i, family='routine', split='train'):
    workforce=int(rng.integers(80,401)); n=int(rng.choice([0,1,2,3],p=[.35,.4,.2,.05])); retro=int(rng.integers(0,9)); hours=float(rng.uniform(24,600)); wage=float(rng.uniform(-8,18)); rate=float(rng.uniform(0,8)); actor=float(rng.uniform(0,5))
    if family=='retroactive': n=int(rng.integers(5,10)); retro=int(rng.integers(40,100)); hours=float(rng.uniform(1,10))
    if family=='wage': wage=float(rng.uniform(85,180)); hours=float(rng.uniform(3,30)); n=max(1,n)
    if family=='coordinated': n=3; retro=int(rng.integers(15,28)); hours=float(rng.uniform(1,8)); rate=float(rng.uniform(14,25)); actor=float(rng.uniform(8,16)); wage=float(rng.uniform(25,55))
    if family=='legitimate_surge': rate=float(rng.uniform(20,42)); actor=float(rng.uniform(1,6))
    if family=='routine' and split=='train' and rng.random()<.06: rate=float(rng.uniform(20,42))
    subject=f'SYN-{split}-{i:05d}'; events=[]
    def add(kind,ago,**kw): events.append(dict(type=kind,recordedAt=int(T-ago*3600000),**kw))
    add('wage',24*120,amount=6000,subject=subject)
    add('wage',24*8,amount=round(6000*(1+wage/100),2),subject=subject)
    for j in range(n):
        ago=hours+j*3
        add('amendment',ago,effectiveAt=int(T-ago*3600000-retro*86400000),subject=subject)
    for j in range(round(rate*workforce/100)): add('employer_exclusion',float(rng.uniform(1,167)),subject=f'SYN-PEER-{j}')
    for j in range(round(actor*workforce/100)): add('supervisor_change',float(rng.uniform(1,23)),subject=f'SYN-PEER-{j}')
    add('claim',0,subject=subject)
    case=dict(id=subject,synthetic=True,asOf=T,workforce=workforce,events=sorted(events,key=lambda e:e['recordedAt']),family=family,split=split)
    if family=='missing': case['workforce']=None
    return case

def features(c):
    if not c['workforce']: return None
    es=[e for e in c['events'] if e['recordedAt']<=c['asOf']]
    am=[e for e in es if e['type']=='amendment' and e['subject']==c['id'] and e['recordedAt']>=c['asOf']-30*86400000]
    w=sorted([e for e in es if e['type']=='wage' and e['subject']==c['id']],key=lambda e:e['recordedAt'])
    return [len(am), max([max(0,(e['recordedAt']-e['effectiveAt'])/86400000) for e in am]or[0]), math.log1p((c['asOf']-max(e['recordedAt'] for e in am))/3600000 if am else 720), (w[-1]['amount']/w[-2]['amount']-1)*100, 100*sum(e['type']=='employer_exclusion' and e['recordedAt']>=c['asOf']-7*86400000 for e in es)/c['workforce'],100*sum(e['type']=='supervisor_change' and e['recordedAt']>=c['asOf']-86400000 for e in es)/c['workforce']]

def rule(x): return x[0]>=4 or x[1]>=30 or x[3]>=80 or x[4]>=35 or x[5]>=20

def metrics(y,p):
    tp=sum(a and b for a,b in zip(y,p)); fp=sum(not a and b for a,b in zip(y,p)); fn=sum(a and not b for a,b in zip(y,p)); tn=sum(not a and not b for a,b in zip(y,p))
    return dict(tp=tp,fp=fp,fn=fn,tn=tn,precision=tp/max(1,tp+fp),recall=tp/max(1,tp+fn),falsePositiveRate=fp/max(1,fp+tn))

rng=np.random.default_rng(20261016)
train=[generate(rng,i) for i in range(2400)]
cal=[generate(rng,i,'legitimate_surge' if i%16==0 else 'routine','calibration') for i in range(800)]
X=np.array([features(c) for c in train],dtype=np.float32); C=np.array([features(c) for c in cal],dtype=np.float32)
model=IsolationForest(n_estimators=100,max_samples=256,random_state=20261016,contamination='auto',n_jobs=1).fit(X)
cal_scores=sorted((-model.score_samples(C)).tolist()); threshold=float(np.quantile(cal_scores,.97))
trees=[]
for estimator in model.estimators_:
    t=estimator.tree_
    trees.append(dict(left=t.children_left.tolist(),right=t.children_right.tolist(),feature=t.feature.tolist(),threshold=t.threshold.tolist(),samples=t.n_node_samples.tolist()))
artifact=dict(version='saned-if-20261016-v1',algorithm='Isolation Forest',sklearnVersion=sklearn.__version__,seed=20261016,features=NAMES,trees=trees,maxSamples=256,threshold=threshold,calibrationScores=cal_scores,trainCount=2400,calibrationCount=800,referenceMedian=np.median(X,axis=0).tolist(),referenceP05=np.quantile(X,.05,axis=0).tolist(),referenceP95=np.quantile(X,.95,axis=0).tolist())
raw=json.dumps(artifact,separators=(',',':')); (OUT/'model.json').write_text(raw)
families=['routine']*240+['legitimate_surge']*60+['retroactive']*100+['wage']*100+['coordinated']*100
test=[generate(rng,i,f,'test') for i,f in enumerate(families)]
TX=np.array([features(c) for c in test],dtype=np.float32); scores=-model.score_samples(TX); y=[c['family'] in ['retroactive','wage','coordinated'] for c in test]; rules=[bool(rule(x)) for x in TX]; ml=[bool(s>=threshold) for s in scores]
report=dict(modelVersion=artifact['version'],artifactSha256=hashlib.sha256(raw.encode()).hexdigest(),validation='Provisional synthetic scenario labels; Haitham review pending',train=2400,calibration=800,test=600,normal=300,review=300,threshold=threshold,thresholdMethod='97th percentile of independent normal calibration cases, fixed before test evaluation',splitMethod='Disjoint synthetic claimant IDs, generated sequentially with a fixed seed; no real-world generalisation claim',metrics={'Rules only':metrics(y,rules),'Isolation Forest only':metrics(y,ml),'Rules + Isolation Forest':metrics(y,[a or b for a,b in zip(rules,ml)])},byScenario={})
for f in sorted(set(families)):
    indexes=[i for i,c in enumerate(test) if c['family']==f]
    report['byScenario'][f]=dict(count=len(indexes),mlFlagged=sum(ml[i] for i in indexes),ruleFlagged=sum(rules[i] for i in indexes))
(OUT/'evaluation.json').write_text(json.dumps(report,indent=2))
(OUT/'evaluation-cases.json').write_text(json.dumps([dict(id=c['id'],family=c['family'],expectedReview=y[i],features=features(c),pythonScore=float(scores[i])) for i,c in enumerate(test)],separators=(',',':')))
demos=[generate(rng,i,f,'demo') for i,f in enumerate(['routine','retroactive','coordinated','legitimate_surge','wage','missing']*4)]
(OUT/'cases.json').write_text(json.dumps(demos,separators=(',',':')))
fixtures=[dict(case=c,features=features(c),score=float(-model.score_samples(np.array([features(c)],dtype=np.float32))[0])) for c in test[::17]]
(OUT/'parity-fixtures.json').write_text(json.dumps(fixtures,separators=(',',':')))
print(json.dumps(report,indent=2))
