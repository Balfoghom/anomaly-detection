# Manal integration contract

The consolidated implementation requirements, CSV mapping, UI behavior, and acceptance tests are in `../MANAL_HANDOVER.md`. That document is the primary handover for application integration.

Use the direct JavaScript module inside the application's backend when possible:

```js
import { assess } from "./cross-journey/inference/detector.mjs";
import cases from "./cross-journey/data/demo-cases.json" with { type: "json" };

const result = assess(cases.find((item) => item.id === "CJ-SYN-demo-00001"));
```

The local adapter on port 8788 is available when a separate process is easier. It is not an authenticated hosted service.

## Demonstration path

Use `CJ-SYN-demo-00001` for the primary proof:

- Same employer across all events
- Three contributors participate across three journeys
- Completed registration → wage → exclusion → SANED sequences
- Comparator rules remain quiet
- Cross-journey model recommends specialist review

Display these fields:

- `modelVersion`
- `score`, labeled **Synthetic review-pattern score**, not fraud probability
- `percentile`, labeled **Percentile versus legitimate calibration cases**
- `modelFlagged` and `ruleFlagged` separately
- `involvedJourneys`
- `linkedContributorCount`
- `reasons`
- `features`
- `route`
- Business pattern status: **Confirmed for the synthetic prototype**
- Model threshold status: **Prototype Data & AI assumption**

Keep the underlying event timeline visible. The proof depends on shared employer and contributor IDs plus timestamps; a summary score alone does not demonstrate cross-journey correlation.

## Data Intake

Two files are provided:

- `data/cross-journey-demo-events.csv`: the self-contained Data Intake upload. It has one row per event and repeats `assessment_time` on every row. Group by `case_id` and preserve repeated `employer_id` and `subject_id` values.
- `data/cross-journey-demo-cases.csv`: one row per assessment case with provisional expected route and validation status.

The event file alone contains all evidence needed for model inference. The case file is reference metadata for the demonstration and acceptance checks; never use its `family` or `expected_review_provisional` columns as model inputs. If the files are joined for display, join them using `case_id`, never row position.

The original Haitham CSV has one row per summarized case. It does not contain the linked event history required by this detector, so it should continue through the original application flow unless a separate mapper is implemented.

## Required behavior

1. Never replace an unavailable model response with a generated or hardcoded score.
2. Keep model and rule results separate.
3. If `complete` is false, show evidence completion rather than low risk.
4. Persist the model version with any human decision.
5. Store specialist routing separately from a final authorized fraud outcome.
6. Reassessment must not erase earlier decisions.
7. Do not describe `score` or `percentile` as fraud probability.
8. Do not automatically create a rule from a reviewed case.

## Local API

- `GET /`: endpoint guide
- `GET /health`: readiness
- `GET /model`: model facts and fingerprint
- `GET /cases`: bundled demonstration cases
- `POST /assess`: assessment for one bundled synthetic case ID

The adapter intentionally accepts only bundled synthetic case IDs. Application access control, persistence, audit history, and hosting remain Manal's responsibility.
