# Manal: integration contract

This is a proposed v0.1 contract implemented by the included local adapter. The trained model works without an external AI provider. Choose either direct module import or the local HTTP adapter; do not implement both unless needed.

## Endpoints

| Method | Path | Result |
|---|---|---|
| GET | `/health` | Readiness, model version, synthetic-only flag |
| GET | `/model` | Algorithm, features, threshold, tree count, fingerprint and validation status |
| GET | `/cases` | IDs and scenario names for the 24 bundled synthetic cases |
| POST | `/assess` | A fresh model assessment for a supplied `case_id` |

Request:

```json
{"case_id":"SYN-demo-00002"}
```

The response includes:

| Field | Meaning / UI treatment |
|---|---|
| `assessmentId`, `assessedAt` | New adapter assessment ID and timestamp; persist alongside human decisions |
| `caseId`, `synthetic`, `validation` | Case identity and data/validation boundaries |
| `modelVersion` | Keep with every assessment |
| `complete` | False means abstention; show evidence-completion state |
| `score` | Raw anomaly score; omitted if incomplete |
| `percentile` | Relative unusualness, not fraud probability; null if incomplete |
| `modelFlagged`, `ruleFlagged` | Independent component outcomes; omitted if incomplete |
| `ruleReasons` | Provisional comparator rule triggers |
| `route`, `band` | Proposed review route and display category |
| `reasons` | Deterministic explanation text |
| `features` | Observed value, median, reference range and out-of-range flag |
| `explanationBoundary` | Feature ranges are context, not exact model attribution |

See `examples/demo-results.json` for complete real outputs. The direct `assess(case)` import returns the model result only; your application generates/persists its own assessment ID and timestamp.

## Required integration behavior

1. Run inference on the supplied synthetic evidence and retain the model version. Never substitute a random or hardcoded score on errors.
2. Keep existing operational controls separately visible. Our provisional comparator rules are not the complete existing engine.
3. Do not average an anomaly percentile into a legacy score without a separately agreed calibration and evaluation design.
4. When `complete` is false, request evidence completion. Do not label the case low risk.
5. Save human decisions separately from model results so reassessment preserves the review history.
6. “Unusualness percentile” is the correct label. Avoid “fraud probability,” “confirmed fraud,” or unvalidated “AI confidence.”
7. The prototype API only accepts bundled synthetic case IDs. No production data upload is supported.
8. The local adapter has no authentication, persistence or deployment configuration. Import into your own backend or add your application's access controls before hosting it.

## Error handling

400: malformed JSON or unsupported request fields. 404: unknown endpoint or synthetic case ID. 413: request exceeds the small ID-only request limit. Treat unreachable service/timeouts as unavailable AI; preserve human review. A complete response with `complete:false` is an intentional abstention, not a transport failure.

## Core model input

Each bundled case has `id`, `synthetic:true`, `asOf` (UTC epoch milliseconds), positive integer `workforce`, and `events`. Events use `type`, `recordedAt`, synthetic `subject`, and, when applicable, `amount` or `effectiveAt`. `family` and `split` are generator metadata excluded from inference. The `synthetic` marker and synthetic ID prefix are input checks, not a way to certify the provenance of arbitrary data. The adapter enforces the supplied-case allowlist.

The first six bundled cases are the demonstration cases listed in `DEMO.md`. The remaining 18 provide different synthetic examples from the same six scenario families. The core model is not a lookup: its score is computed from event-derived features at each invocation.
