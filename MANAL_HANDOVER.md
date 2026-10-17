# AI model handover for Manal

**Date:** 17 October 2026

**Purpose:** integrate the supplied synthetic AI models into the existing JavaScript/Node application for the committee demonstration.

**Primary demo:** upload the cross-journey event CSV, assess every grouped case with the fitted model, and show a case that the comparator rules miss but the AI routes to specialist review.

This document is the implementation source of truth for Manal and any coding assistant helping her. If the current application conflicts with this contract, preserve the model contract and adapt the application around it. Do not recreate the score in UI code.

## 1. What has been delivered

There are two separate AI models:

| Capability | Location | Algorithm | Purpose |
|---|---|---|---|
| SANED single-journey anomaly detection | `saned-anomaly/` | Isolation Forest | Finds unusual combinations within one SANED claimant history using six features |
| Cross-journey detection | `cross-journey/` | Random Forest classifier | Finds provisional review patterns across connected Employer Registration, Contribution & Wage, Benefit Payments, Retirement, and SANED events using sixteen features |

The cross-journey model is the priority for the new demonstration. It does **not** replace the SANED model. The application can show them as two complementary AI capabilities.

### Explicit replacement decision

**Do not replace or delete the SANED Isolation Forest. Add the cross-journey Random Forest as a second detector.**

Use each detector only when its required evidence is available:

| Incoming evidence | Detector to call | If evidence is missing |
|---|---|---|
| One SANED claimant history with the SANED model's workforce, wage, amendment, exclusion, supervisor-change, and claim evidence | SANED Isolation Forest | Return its `complete:false` result |
| Connected employer/contributor event history using the cross-journey CSV contract | Cross-journey Random Forest | Return its `complete:false` result |
| Haitham's original summarized 20-case CSV | Existing sandbox display flow only | Do not pretend either fitted model assessed it |

Do not run both models against every record merely because a SANED event appears. Their schemas, features, scores, thresholds, and validation evidence are different. Do not average their scores. If a future case legitimately contains complete inputs for both models, store and display two separate assessments and route it for specialist review when either model or a mandatory business control requires review.

Both models are already trained. The fitted trees are stored in `data/model.json` files, and the JavaScript inference modules run those trees directly. They do not call ChatGPT, an LLM, or an external AI service. No API key and no Python runtime are needed for inference.

## 2. What the cross-journey model does

The model examines a connected, timestamped history for one synthetic employer and its contributors. It looks back 30 days from the case assessment time and converts the raw events into sixteen numerical features. Its fitted trees compare the resulting pattern with the synthetic patterns used in training.

The main demonstration case contains this sequence for three linked contributors:

`Employer registration → wage change → retroactive exclusion → SANED request`

Each individual value stays below the included comparator-rule thresholds, so `ruleFlagged` is false. The combined sequence resembles the provisional review pattern learned by the model, so `modelFlagged` is true and the proposed route is `Specialist review`.

The model recommends a review route. It does not confirm fraud, reject a claim, stop a payment, create a business rule, or learn automatically from a reviewer decision.

## 3. How it was trained

Model version: `madar-cross-journey-rf-20261017-v1`

- Algorithm: supervised Random Forest classifier with 180 decision trees.
- Training set: 6,700 connected synthetic histories.
- Training labels: 4,000 routine or legitimate histories and 2,700 provisional review-pattern histories.
- Calibration set: 1,000 separate routine or legitimate synthetic histories.
- Test set: 700 separate synthetic histories: 400 routine or legitimate and 300 provisional review patterns.
- Separation: case, employer, contributor, and identifier IDs do not overlap between training, calibration, and test sets.
- Threshold: selected from the 97th percentile of the separate legitimate calibration population.
- Exported threshold: `0.00038115594062715477`; the application must use the returned `modelFlagged` value instead of comparing this number itself.
- Reproducibility seed: `20261017`.

The review labels are design assumptions awaiting Haitham's business validation. The evaluation uses new records from the same synthetic generator, so the reported result is evidence that the prototype works as designed. It is not evidence of production fraud accuracy.

Held-out synthetic test results:

| Method | Review cases found | Review cases missed | Legitimate cases flagged | Accuracy |
|---|---:|---:|---:|---:|
| Comparator rules | 150 / 300 | 150 | 0 / 400 | 78.6% |
| Cross-journey AI | 300 / 300 | 0 | 16 / 400 | 97.7% |
| Rules OR AI | 300 / 300 | 0 | 16 / 400 | 97.7% |

Use the wording **97.7% accuracy on the held-out synthetic test set**. Do not call this production accuracy or “100% fraud detection.” The 16 legitimate cases sent to review show that the model can create extra specialist workload.

## 4. Raw input contract for Data Intake

Use this file for the live cross-journey upload:

`cross-journey/data/cross-journey-demo-events.csv`

It is a self-contained event file. One row is one event. Several rows belong to the same assessment case. The app must group rows by `case_id` before calling the model.

| CSV column | Required | Meaning and conversion |
|---|---|---|
| `case_id` | Yes | Grouping key. Must start with `CJ-SYN-` |
| `assessment_time` | Yes | UTC epoch milliseconds. Convert with `Number(...)`. It defines the end of the 30-day window |
| `event_id` | Yes | Synthetic event identity |
| `recorded_at` | Yes | UTC epoch milliseconds when the event was recorded. Convert with `Number(...)` |
| `effective_at` | Conditional | UTC epoch milliseconds when the event took effect. Blank becomes `undefined` |
| `journey` | Yes | Display journey such as `SANED` or `Contribution & Wage` |
| `event_type` | Yes | One of `registration`, `wage`, `exclusion`, `claim`, `payment`, `retirement`, `maternity` |
| `subject_id` | Yes | Contributor identity. Must start with `CTR-SYN-` |
| `employer_id` | Yes for scoring | Shared employer identity. Must start with `EMP-SYN-`; blank causes model abstention |
| `identifier_id` | Conditional | Linked IBAN, mobile, or device identity. Blank becomes `undefined` |
| `amount` | Required for wage events | Current synthetic wage. Blank becomes `undefined` |
| `previous_amount` | Required for wage events | Previous positive synthetic wage. Blank becomes `undefined` |
| `source_conflict` | Yes | `1` means true and `0` means false |
| `rule_override` | Yes | `1` means true and `0` means false |
| `synthetic` | Yes | Must equal `1`; the resulting case uses `synthetic: true` |

Validation requirements:

1. Reject an upload with missing required columns; show the missing column names.
2. Reject invalid numbers, timestamps, booleans, event types, or synthetic ID prefixes.
3. Within one `case_id`, require one consistent `assessment_time` and one consistent `employer_id` value. A uniformly blank employer is allowed to reach the model as incomplete; conflicting employer IDs are rejected. The supplied incomplete test case intentionally has no employer and should not crash the import.
4. Preserve repeated `subject_id`, `employer_id`, and `identifier_id` values. These repeated identifiers create the links the detector needs.
5. Do not deduplicate legitimate separate events merely because they share a subject or employer.
6. Do not use the scenario name, expected result, route, or any manually entered label as a model feature.

Haitham's `Madar_20_Synthetic_Test_Cases.csv` is useful for the original case-level demonstration, but its rows do not share entity IDs and it has no linked event history. Do not send it through this cross-journey model or claim that it proves cross-journey correlation.

## 5. Required transformation before inference

After parsing the CSV, create one object per `case_id` in this exact shape:

```js
{
  id: "CJ-SYN-demo-00001",
  synthetic: true,
  asOf: 1792195200000,
  employerId: "EMP-SYN-demo-00001",
  events: [
    {
      eventId: "EVT-CJ-SYN-demo-00001-001",
      journey: "Employer Registration",
      type: "registration",
      recordedAt: 1790062819355,
      subjectId: "CTR-SYN-demo-00001-01",
      employerId: "EMP-SYN-demo-00001",
      sourceConflict: false,
      ruleOverride: false
    }
  ]
}
```

For optional CSV values, omit the JavaScript property or set it to `undefined`; do not convert a blank field to zero. Sort events by `recordedAt` for a stable timeline, although the model result itself is designed not to depend on input array order.

Call the fitted model once for each grouped case:

```js
import { assess } from "./cross-journey/inference/detector.mjs";

const result = assess(caseRecord);
```

Recommended integration: import `assess()` into the application's Node backend and let the existing authenticated application call that backend. The included local HTTP adapter is useful for testing bundled cases, but `POST /assess` accepts only a bundled `case_id`; it does not accept an uploaded CSV or arbitrary event payload. Do not post raw CSV rows to port 8788.

If the hosted application has no Node backend, stop and agree the deployment approach before moving model execution into the browser. Do not replace a failed model call with the old score, a random value, or a hardcoded demo answer.

## 6. Sixteen internal model inputs

The application supplies raw events. `extractFeatures()` calculates these model inputs; Manal should not calculate them separately in the UI:

1. Distinct journeys in the preceding 30 days.
2. Total events in the preceding 30 days.
3. Distinct linked contributors in the preceding 30 days.
4. Employer registrations in the preceding 30 days.
5. Wage changes in the preceding 30 days.
6. Employment exclusions in the preceding 30 days.
7. SANED requests in the preceding 30 days.
8. Maximum wage percentage change.
9. Maximum retroactive period in days.
10. Hours since the latest wage change, transformed internally with `log(1 + hours)`.
11. Maximum number of contributors sharing one identifier.
12. Count of cross-source conflicts.
13. Count of rule overrides.
14. Number of participants in a completed coordinated sequence.
15. Whether an ordered registration → wage → exclusion → SANED sequence exists.
16. Days from the first registration to the final SANED request in that sequence.

Only events recorded on or before `assessment_time` and within the preceding 30 days are used. A future-recorded event cannot affect the assessment, even if its effective date is earlier.

The input schema accepts `maternity` events, but the current training population contains no maternity-specific review pattern. Maternity events may contribute to journey and event counts; do not claim that this version detects a validated maternity fraud pattern.

The included comparator rules are ordinary code, not AI. They trigger at eight registrations, five SANED requests, an 80% wage increase, 30 retroactive days, one identifier shared by four contributors, two cross-source conflicts, or three rule overrides. The combined route uses rules **OR** AI, while keeping their results visible separately.

## 7. Model output contract

`assess(caseRecord)` returns:

For `complete:true`, it returns the full assessment below. For `complete:false`, it intentionally omits `score`, `modelFlagged`, and `ruleFlagged`; the UI must handle those fields as unavailable.

| Field | Meaning and required UI treatment |
|---|---|
| `modelVersion` | Persist and display in model details |
| `complete` | `false` means the model abstained because evidence is missing |
| `score` | Similarity to provisional synthetic review patterns; never call it fraud probability |
| `percentile` | Position relative to legitimate calibration scores; never call it confidence |
| `modelFlagged` | Whether the trained model crossed its fitted review threshold |
| `ruleFlagged` | Whether one or more included comparator rules fired |
| `ruleReasons` | Exact comparator-rule triggers |
| `involvedJourneys` | Journeys found in the accepted history |
| `linkedContributorCount` | Distinct contributors in the 30-day history |
| `route` | `Specialist review`, `Standard review`, or `Complete evidence` |
| `band` | `Review`, `Typical`, or `Incomplete` |
| `features` | Calculated value and synthetic reference range for each feature |
| `reasons` | Deterministic explanation sentences |
| `scoreBoundary` | Mandatory interpretation boundary for the score |
| `explanationBoundary` | Mandatory interpretation boundary for the feature ranges |

Use `modelFlagged` as the AI decision. Do not reimplement the threshold in the UI and do not infer the decision from `percentile`. Some legitimate calibration scores are tied at zero, so a non-flagged case can still show a high percentile.

The prototype's combined routing rule is:

```text
if evidence is incomplete        → Complete evidence
else if modelFlagged OR ruleFlagged → Specialist review
else                              → Standard review
```

Keep the two flags separate on screen. The main value demonstration is that the model can flag a coordinated sequence while the comparator rules remain quiet.

## 8. What the interface must show

After a successful upload:

1. Show accepted rows, rejected rows, number of grouped cases, and processing status.
2. Show one assessment row or card per `case_id`.
3. Show `AI: Flagged / Not flagged` and `Rules: Triggered / Not triggered` separately.
4. Show the proposed route and do not show “confirmed fraud.”
5. Open a case detail view with the timestamped event timeline, involved journeys, shared employer, linked contributors, reasons, feature values, model version, and business-validation status.
6. For `complete:false`, show `Evidence incomplete — model did not score this case`; do not show low risk.
7. Allow the specialist to record a separate human decision. Save the model output and model version without overwriting them.
8. Label all uploaded and generated records as synthetic.

Recommended labels:

- `Synthetic review-pattern score`
- `Percentile versus legitimate synthetic calibration cases`
- `AI model result`
- `Comparator rule result`
- `Proposed route`
- `Business validation: Pending Haitham review`

Avoid these labels:

- `Fraud probability`
- `AI confidence`
- `Fraud confirmed by AI`
- `Auto-blocked` or `Auto-rejected`

## 9. Acceptance tests for the integrated app

Upload `cross-journey/data/cross-journey-demo-events.csv`. The integrated app must produce six grouped cases with these outcomes:

| Case | Expected AI | Expected rules | Expected route | Purpose |
|---|---|---|---|---|
| `CJ-SYN-demo-00000` | Not flagged | Not triggered | Standard review | Routine comparison |
| `CJ-SYN-demo-00001` | Flagged | Not triggered | Specialist review | Primary proof: AI finds the coordinated sequence missed by rules |
| `CJ-SYN-demo-00002` | Not flagged | Not triggered | Standard review | Legitimate restructuring comparison |
| `CJ-SYN-demo-00003` | Flagged | Triggered | Specialist review | Shared identifier network |
| `CJ-SYN-demo-00004` | Flagged | Triggered | Specialist review | Retroactive cross-source conflict |
| `CJ-SYN-demo-00005` | Abstained | Not assessed | Complete evidence | Missing-employer safety behavior |

For the primary proof case, also verify:

- `modelVersion` equals `madar-cross-journey-rf-20261017-v1`.
- `complete` is true.
- `modelFlagged` is true.
- `ruleFlagged` is false.
- `score` is `1` with the supplied fixed model and demo data.
- `percentile` is `100` with the supplied fixed calibration set.
- `linkedContributorCount` is `3`.
- `involvedJourneys` contains Employer Registration, Contribution & Wage, and SANED.
- The event timeline shows three contributors linked to the same employer.

The integration is ready for demonstration only when these acceptance results come from an actual `assess()` call after CSV parsing. Matching text produced by old UI logic or hardcoded values does not pass.

## 10. Files Manal must use

| File | Use |
|---|---|
| `cross-journey/inference/detector.mjs` | Actual JavaScript feature extraction and fitted inference |
| `cross-journey/data/model.json` | Fitted 180-tree model; must remain next to the module's expected path |
| `cross-journey/data/cross-journey-demo-events.csv` | Live Data Intake upload |
| `cross-journey/data/demo-cases.json` | Ready-made grouped records for debugging and comparison |
| `cross-journey/examples/demo-results.json` | Expected complete output examples |
| `cross-journey/data/evaluation.json` | Synthetic evaluation evidence and model fingerprint |
| `cross-journey/tests/` | Contract and parity checks |

For the separate SANED single-journey model, use `saned-anomaly/inference/detector.mjs`, `saned-anomaly/data/model.json`, and `saned-anomaly/INTEGRATION.md`. Do not mix the SANED six-feature input with the cross-journey sixteen-feature input.

## 11. Verification commands

From the `anomaly-detection/cross-journey` directory with Node 22.13 or newer:

```sh
npm test
npm run demo
```

`npm test` must pass before the hosted demonstration. `npm run demo` must print the six outcomes listed above. Python is required only to retrain; Manal should not retrain during integration.

## 12. Instructions for any coding assistant

When ChatGPT or another coding assistant helps with the app, provide this document and require it to follow these constraints:

1. Use the supplied `assess()` implementation and `model.json`; do not invent another scoring formula.
2. Implement the CSV-to-case transformation exactly as specified.
3. Keep rule and AI outcomes separate.
4. Treat incomplete evidence as abstention, never as low risk.
5. Use the returned `modelFlagged` field rather than recalculating a threshold.
6. Never call the model score probability, accuracy, or confidence.
7. Never claim the AI confirms fraud or automatically changes a business rule.
8. Preserve the existing assessment and human-decision history on reassessment.
9. Keep all demonstration data synthetic.
10. Prove the integration with the six acceptance cases before changing styling.

## 13. Governance boundary

The intended lifecycle is:

`AI/rule signal → specialist investigation → authorized fraud outcome → stored feedback evidence`

A confirmed case does not automatically become a business rule. After enough validated outcomes accumulate, the team may propose a new rule, feature, or retrained model. That proposal must be tested offline, versioned, reviewed by Data & AI and the business owner, and approved before activation.

Current business status: all cross-journey labels, thresholds, and expected routes remain pending Haitham's validation.

## 14. Required application architecture

The current application has an existing browser function called `assess(raw)` that calculates a configurable 0–100 sandbox score from manually supplied summary fields. That function is deterministic prototype logic; it is not either fitted model in this package.

Manal should use distinct names and keep the result types separate:

```js
import { assess as assessSanedAnomaly } from "./anomaly-detection/saned-anomaly/inference/detector.mjs";
import { assess as assessCrossJourney } from "./anomaly-detection/cross-journey/inference/detector.mjs";

// Rename the current app function if it is retained for the old demonstration.
function assessLegacySandbox(raw) {
  // Existing app calculation only.
}
```

Recommended stored structure:

```js
{
  id: "CJ-SYN-demo-00001",
  sourceType: "cross-journey-events",
  synthetic: true,
  eventHistory: [/* accepted events */],
  aiAssessments: {
    crossJourney: {
      engine: "cross-journey-random-forest",
      assessedAt: "2026-10-17T...Z",
      result: assessCrossJourney(caseRecord)
    }
  },
  humanDecision: null
}
```

For a SANED model case, store the result under `aiAssessments.saned`. Never copy either fitted model's `score` into the existing top-level `item.score` field. The legacy UI treats that field as a 0–100 risk score, while the cross-journey result is a 0–1 pattern score and the SANED result is an Isolation Forest unusualness score. The returned `modelFlagged`, `complete`, and `route` fields control the fitted-model display.

Run model inference on the Node/server side when the hosted application has a backend. The browser sends the uploaded synthetic CSV to the application backend; the backend parses, validates, groups, calls the model, and returns assessments. If the application is browser-only, bundle the supplied modules and JSON artifacts through the application's build process and run the same functions locally. Do not depend on the standalone localhost services in the hosted demonstration.

At application startup, load both artifacts and expose their readiness separately:

```text
SANED model: ready / unavailable — saned-if-20261016-v1
Cross-journey model: ready / unavailable — madar-cross-journey-rf-20261017-v1
```

An unavailable model must produce a visible unavailable state. It must never fall back silently to the old sandbox calculation.

## 15. Page-by-page changes

### Data Intake — required for the live demonstration

This is the highest-priority page.

1. Inspect the normalized CSV headers before choosing a processing path.
2. When the headers include `case_id`, `assessment_time`, `event_id`, `recorded_at`, `event_type`, `subject_id`, and `employer_id`, use the cross-journey import path.
3. Validate all columns using Section 4, group rows by `case_id`, create the object in Section 5, and call `assessCrossJourney()` once per group.
4. Keep the existing summarized-case importer as a separately named legacy path. Do not pass cross-journey rows into the current `existing_control_score` importer.
5. Change the import result panel for a cross-journey upload to show:
   - 35 event rows accepted;
   - 0 structurally rejected rows;
   - 6 grouped assessment cases;
   - 5 cases scored;
   - 1 incomplete case;
   - 3 AI-flagged cases;
   - 2 comparator-rule-triggered cases;
   - 1 AI-only detection.
6. After import, provide an `Open AI-only proof case` action that selects `CJ-SYN-demo-00001` in the Intelligence Queue.
7. Update the downloadable template behavior. Either provide two clearly named templates—`Summarized case template` and `Cross-journey event template`—or make the cross-journey event file the primary live-demo template. Never combine the two schemas into one ambiguous template.

For import mode:

- `Replace current session data` should replace the visible session only after the entire file passes structural validation and model processing completes.
- `Append to current data` should retain earlier cases and add six grouped cases, not 35 event rows as 35 cases.
- A failed import must leave the current session unchanged.

### Intelligence Queue — required

The current queue assumes every case has a Low/Medium/High score and an “AI anomaly” number. Cross-journey cases use `Typical`, `Review`, or `Incomplete` and must not be forced into the old 0–100 display.

For a cross-journey queue row, show:

| Column | Display |
|---|---|
| Case | `case_id` |
| Journey | `Cross-journey · 3 journeys` or the actual journey count |
| Linked context | Shared employer and linked contributor count |
| AI model | `Flagged`, `Not flagged`, or `Not scored` |
| Rules | `Triggered`, `Not triggered`, or `Not assessed` |
| Proposed route | Returned `route` |
| Status | `Awaiting specialist`, `Standard review`, or `Evidence incomplete` |

Add filters for `AI flagged`, `Rules triggered`, `AI-only`, and `Incomplete` if time permits. The existing Low/Medium/High filters can continue to apply to legacy cases, but they must not hide or relabel cross-journey cases incorrectly.

The primary proof row must say:

```text
CJ-SYN-demo-00001
Cross-journey · 3 journeys
AI: Flagged
Rules: Not triggered
Route: Specialist review
Status: Awaiting specialist
```

### Case detail panel — required

For cross-journey cases, replace the old circular 0–100 risk score with a model-result panel. Show:

- AI model result: Flagged / Not flagged / Not scored.
- Comparator-rule result: Triggered / Not triggered / Not assessed.
- Proposed route.
- Model version.
- Synthetic review-pattern score with its interpretation boundary.
- Percentile versus legitimate synthetic calibration cases.
- Shared employer ID.
- Linked contributor count.
- Involved journeys.
- Returned reasons.
- Business validation: `Pending Haitham review`.

Add a timestamped event timeline. For each event, display journey, event type, contributor, recorded time, relevant effective time, and relevant wage or identifier evidence. The main case must visibly show the ordered registration → wage → exclusion → SANED sequence for three contributors tied to one employer.

Add a feature-evidence section using the returned `features` array. Present each observed value beside its synthetic reference range. Include `explanationBoundary`; do not describe a reference-range difference as the cause of the decision or as exact feature importance.

Keep the current specialist actions, but store them separately from the model output:

- Approve or override the proposed route.
- Record an investigation outcome.
- Record the decision owner, time, and evidence note.
- Never mutate the original model result when a human changes the route.
- Never pre-populate a confirmed-fraud outcome from the model flag.

### Dashboard — required, but keep it compact

Add a `Cross-journey AI` section or metric group based on the current session. For the supplied demonstration upload it should show:

- 6 grouped cases;
- 5 scored;
- 3 AI flagged;
- 1 AI-only detection;
- 1 evidence-incomplete case.

Add the primary proof case to `Latest assessment decisions` with wording such as: `Cross-journey AI flagged a linked sequence while comparator rules remained quiet; specialist review recommended.`

Do not add the model's 0–1 score to the existing High/Medium/Low risk distribution. If the legacy distribution remains, label it `Legacy sandbox risk distribution`. Display the fitted-model result separately as `Review`, `Typical`, and `Incomplete`.

### Model & Governance — required

Add two model cards:

**SANED anomaly model**

- Isolation Forest.
- Version from the returned `modelVersion`.
- Six SANED features.
- 2,400 synthetic training histories, 800 calibration histories, and 600 held-out test histories.
- Business validation pending.
- Output is unusualness, not fraud probability.

**Cross-journey pattern model**

- Random Forest classifier with 180 trees.
- Version `madar-cross-journey-rf-20261017-v1`.
- Sixteen derived cross-journey features.
- 6,700 synthetic training histories, 1,000 calibration histories, and 700 held-out test histories.
- Haitham validation pending.
- Output is synthetic review-pattern similarity, not fraud probability.

Keep the existing human-governance flow. Add that reviewer outcomes become stored feedback evidence and do not automatically retrain a model or create a business rule.

### Appendix: Scoring — required truthfulness update

The existing 55% controls + 45% anomaly + pattern-adjustment formula belongs to the original sandbox simulation. It is not the calculation used by either fitted model.

Retitle that section `Legacy sandbox scoring simulation` and add a clear note:

> This configurable formula supports the original interface demonstration. The fitted SANED Isolation Forest and cross-journey Random Forest calculate separate model outputs and are not produced by these sliders or weights.

Add a short `Fitted AI models` section linking each model to its feature set, output, model version, and evaluation boundary. Do not present the Random Forest score inside the worked 0–100 formula.

### Scoring Simulation — preserve, but isolate

Keep the page if it is useful to the demonstration, but its sliders must affect only legacy sandbox cases. They must not change either fitted model result, threshold, model artifact, or model version.

Change the page notice to state that it is an illustrative legacy scoring configuration and is separate from the fitted-model evidence. The `Apply to sandbox` action must not reassess cross-journey cases through the legacy `assess(raw)` function.

### Risk Indicators — recommended

Add these as `Proposed / pending Haitham validation`, not approved production indicators:

- Coordinated registration → wage → exclusion → SANED sequence.
- Cross-journey identifier reuse.
- Retroactive change with cross-source conflict.

The indicator page may link to the matching demonstration case. Submitting an indicator for testing must not change the fitted model or activate a rule.

### Executive Dashboard and Monthly Business Report — optional after the required pages work

If time remains, add session aggregates for AI flagged, rule triggered, AI-only, incomplete, and specialist outcomes. Do not count a model flag as suspected or confirmed fraud. Do not calculate amount prevented from a model result; only use an authorized human outcome and verified payment status.

## 16. Required processing flow

Implement the live path in this order:

```text
Upload CSV
→ identify cross-journey schema
→ validate all rows
→ group rows by case_id
→ build one caseRecord per group
→ call assessCrossJourney(caseRecord)
→ store immutable model result + model version
→ render queue and case detail
→ allow a separate human route/outcome decision
→ refresh dashboard aggregates
```

Do not start by changing the executive pages or visual styling. First prove that the upload reaches the fitted model and produces the six acceptance outcomes.

## 17. Application integration definition of done

The integration is complete when all of the following are true:

1. The SANED Isolation Forest remains available and unchanged.
2. The cross-journey Random Forest is added as a separate detector.
3. The two detectors have separate names, input mappings, outputs, and model versions.
4. The uploaded cross-journey event file becomes six cases rather than 35 cases.
5. `CJ-SYN-demo-00001` is produced by a real `assessCrossJourney()` call and shows AI flagged, rules not triggered, specialist review.
6. `CJ-SYN-demo-00005` shows evidence incomplete and no fabricated score.
7. The case detail visibly proves the shared employer, linked contributors, three journeys, and event order.
8. Human decisions are stored separately and do not alter the model result.
9. The old 55/45 simulation is clearly labeled and cannot modify fitted-model results.
10. No screen labels either model's score as fraud probability, confidence, confirmed fraud, or production accuracy.
11. Refreshing or reassessing does not silently replace the model version or erase prior human decisions.
12. Both model test suites pass before the hosted demonstration.
