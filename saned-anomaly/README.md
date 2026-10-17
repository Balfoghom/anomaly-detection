# SANED single-journey anomaly model

**Status:** Working AI component, ready for Manal to integrate. Synthetic-only; business validation by Haitham is pending. This package is independent of the application UI. It has not been published as a hosted service.

## What is actually AI?

A scikit-learn Isolation Forest learns a reference distribution from 2,400 generated claim histories. Its 100 fitted trees are exported in `data/model.json`. `inference/detector.mjs` traverses those trees to score a new history. No AI service subscription or API key is required for this model.

The model is trained once; it does not learn from reviewer decisions automatically. The rules, route selection, reference-range explanations, and summaries are ordinary deterministic code. There is no LLM or autonomous agent in this version.

## Quick start for Manal

Requires Node 22.13 or newer. In this directory:

```sh
npm test
npm run demo
npm start
```

Inference has **zero npm dependencies**; no installation is required. The server binds to `127.0.0.1:8787`. It is a local integration adapter, not an authenticated public service. Manal can import the inference module into her application's backend instead of deploying a second service.

```js
import { assess } from './inference/detector.mjs';
import cases from './data/cases.json' with { type: 'json' };
const result = assess(cases.find(c => c.id === 'SYN-demo-00002'));
```

Or use the local endpoint:

```sh
curl http://127.0.0.1:8787/model
curl http://127.0.0.1:8787/cases
curl -X POST http://127.0.0.1:8787/assess \
  -H 'Content-Type: application/json' \
  -d '{"case_id":"SYN-demo-00002"}'
```

The adapter only accepts the 24 supplied synthetic case IDs; it rejects arbitrary case payloads. No database, saved human decisions, hosting, UI or user authentication is included in this AI package. Those belong to Manal's application.

## Data → features → AI → review

Raw synthetic events include wage records, claimant amendments, employer exclusions, supervisor changes and claim submission. Features are calculated using only events **recorded on or before** the synthetic assessment time. A future-recorded event is excluded even if its effective date is earlier.

| Feature | Exact definition |
|---|---|
| Amendment count | Claimant amendments recorded in the preceding 30 days |
| Maximum backdating | Maximum nonnegative difference between amendment recording and effective date, in days |
| Amendment recency | `log(1 + hours since latest amendment)`; 720 hours when none occurred in the 30-day window |
| Wage change | Percentage change between the last two recorded claimant wages |
| Employer exclusion rate | Exclusion events in seven days per 100 current reference workers |
| Supervisor change rate | Supervisor-change events in 24 hours per 100 current reference workers |

The reference workforce is provided by the synthetic generator. Exclusion and supervisor inputs are assumed to already be scoped to the case's employer and relevant supervisor; a production event join is not implemented. Rates count events, not deduplicated people. Claim IDs, scenario names, expected outcomes, and labels never enter the model. The current model does not analyze text, graph relationships, or arbitrary event sequences.

Missing workforce, missing wage history, missing claim evidence or malformed required events cause abstention. No percentile is fabricated. There is no imputation of missing evidence.

## Scores and routing

- `score`: raw Isolation Forest unusualness, higher means more unusual. It is not a fraud probability.
- `percentile`: percentage of the 800 normal calibration scores less than or equal to the claim's score. 100 means above all calibration cases, **not 100% fraud likelihood**.
- `modelFlagged`: raw score is at least `0.6200281595573496`, the 97th percentile of the calibration set.
- `ruleFlagged`: one or more **new provisional comparator rules** fire: 4 amendments, 30 backdated days, 80% wage increase, 35 exclusions per 100 workers, or 20 supervisor changes per 100 workers.
- `route`: `Specialist review` if either component flags; otherwise `Standard review`. Missing required data gives `Complete evidence`.

These comparator rules are not validated SANED policy and are not the full legacy Haitham scoring engine. Manal should display AI and existing controls separately; preserve mandatory business controls. Do not silently replace the legacy 55/45 score with this model's percentile. Our proposed hybrid is an OR review gate, not an averaged fraud score.

`features` shows the observed values and the reference population's 5th–95th percentile range. These are contextual deviations, **not causal explanations or exact feature attributions**. The displayed amendment-recency value is converted back to hours.

The AI never confirms fraud, denies benefits, stops payment, or proves eligibility. Human review remains necessary.

## Evaluation, including failures

Training: 2,400 reference histories. Calibration: 800 separate normal/legitimate histories. Test: 600 separate histories, consisting of 300 provisional review cases and 300 provisional legitimate cases. A fixed random seed makes the run reproducible. Claimant IDs are disjoint between partitions. All partitions use the same generator and distributions; this is not external or real-world validation.

| Method | Review cases caught / 300 | Missed | False alarms / 300 legitimate |
|---|---:|---:|---:|
| Provisional rules only | 200 | 100 | 14 |
| Isolation Forest only | 221 | 79 | 16 |
| Rules OR Isolation Forest | 300 | 0 | 27 |

The model flags all 100 designed coordinated-change cases, which the comparator rules miss. It misses 79 of 100 designed wage-increase cases, which the rules catch. It flags 13 of 60 legitimate employer-reduction cases. The combined approach therefore increases review workload as well as detection coverage.

**Do not describe the combined result as “100% fraud detection accuracy.”** It is recall against our provisional generator labels. Real fraud accuracy, savings, fairness and operational workload have not been established. The simple generator makes designed anomaly families easier to distinguish and cannot validate novel real-world fraud.

Detailed results: `data/evaluation.json`. All 600 test vectors, provisional labels and Python reference scores: `data/evaluation-cases.json`. A separate fixture file includes raw histories for feature-extraction parity checks. The model fingerprint links the evaluation to the exact exported artifact.

## Verification

The automated suite checks:

- Exported JavaScript inference matches Python/scikit-learn to `1e-10` on all 600 held-out test vectors.
- Raw event feature extraction matches Python on 36 independently selected test histories.
- Future events cannot leak into current assessments.
- Reordering events or changing labels does not change the score.
- Changing actual event evidence changes the score.
- Missing/malformed evidence causes abstention.
- The inference endpoint rejects arbitrary records and runs the actual fitted model.

## Retraining

Only retraining needs Python and the pinned dependencies:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-training.txt
.venv/bin/python training/train.py
npm test
npm run demo
```

The supplied model can be used without retraining. Preserve its fingerprint and version when integrating. The training script regenerates all artifacts deterministically. For any change to the generator or model, assign a new version, preserve this baseline, and generate a fresh untouched test set before comparing results. Business validation may change the expected labels, feature definitions and review thresholds.

## Team handoff

- **Manal:** integrate `assess()` or the adapter, keep model version and assessment IDs, show missing-evidence/error states, capture human decisions in her app, and handle deployment/access controls.
- **Haitham:** validate the six scenario families, expected routes, legitimate exceptions, feature windows and comparator thresholds using `SCENARIO_REVIEW.md`.
- **User + AI workstream:** own synthetic scenario generation, feature definitions, model training, comparisons, limitations and the next evaluation after Haitham's review.

See `INTEGRATION.md` for the request/response contract and `DEMO.md` for a short review sequence. The original application source is unchanged. An earlier separate `saned-prototype` UI draft is unintegrated and unpublished; the AI deliverable is this directory.

For the consolidated application handover, including the cross-journey upload schema and acceptance tests, use `../MANAL_HANDOVER.md`.

## Cross-journey proof

The sibling `../cross-journey/` directory contains a separate connected-entity proof spanning Employer Registration, Contribution & Wage, and SANED. It preserves this SANED Isolation Forest as the baseline and adds a supervised synthetic pattern model, event-level Data Intake files, evaluation, tests, and Manal's integration contract. Its business labels remain pending Haitham's validation.
