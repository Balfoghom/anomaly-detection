# Madar cross-journey detection proof

**Status:** working synthetic proof. Business scenario labels and thresholds remain pending Haitham's validation. This component does not replace the SANED Isolation Forest in the parent directory.

## What this proves

The model connects events through the same synthetic employer and contributors across:

1. Employer Registration
2. Contribution & Wage
3. SANED

The main proof case contains three contributors who follow a registration → wage change → retroactive exclusion → SANED request sequence. Each individual signal remains below the included comparator-rule thresholds. The trained cross-journey model recommends specialist review.

The result is calculated from the event history. It is not hardcoded to the case ID or scenario name. Case IDs, family names, split names, expected outcomes, and explanations are excluded from model features.

## Model design

The SANED model in the parent directory remains an unsupervised Isolation Forest for novel behavior. The cross-journey component is a supervised Random Forest trained on provisional synthetic scenario labels.

This design is deliberate. A broad Isolation Forest was tested first, but legitimate high-volume activity was more globally unusual than the coordinated below-threshold sequence. A supervised pattern model is more suitable for proving detection of a specific business typology. Haitham's validation is therefore required before the labels can be treated as business-approved.

The model uses 16 derived features, including journey count, event volume, linked contributors, registration/wage/exclusion/SANED counts, wage and retroactivity values, identifier reuse, conflicts, overrides, and the count and timing of completed cross-journey sequences.

The model score measures similarity to the provisional synthetic review patterns. It is not a fraud probability.

## Data and evaluation

- Training: 6,700 synthetic connected histories
- Calibration: 1,000 separate routine or legitimate histories
- Test: 700 separate histories
- Test population: 400 routine/legitimate and 300 provisional review cases
- Model: 180-tree Random Forest
- Model version: `madar-cross-journey-rf-20261017-v1`

| Method | Review cases found | Missed | Legitimate cases flagged | Accuracy |
|---|---:|---:|---:|---:|
| Provisional rules | 150 / 300 | 150 | 0 / 400 | 78.6% |
| Cross-journey model | 300 / 300 | 0 | 16 / 400 | 97.7% |
| Rules OR model | 300 / 300 | 0 | 16 / 400 | 97.7% |

The key proof family contains 150 coordinated-sequence test cases. The model flags all 150 while the comparator rules flag none. These results are against the same synthetic generator families used to design training data. They do not establish production fraud accuracy, savings, fairness, or generalisation to real GOSI activity.

The 16 false alarms include five routine cases and eleven legitimate-growth cases. They are retained in the report and should be discussed as review workload.

## Files for Manal

- `lib/detector.mjs`: direct JavaScript inference
- `data/model.json`: exported fitted model
- `data/demo-cases.json`: complete linked histories
- `data/cross-journey-demo-events.csv`: self-contained event-level Data Intake upload, including assessment time
- `data/cross-journey-demo-cases.csv`: case-level labels and validation status
- `data/evaluation.json`: evaluation summary
- `examples/demo-results.json`: real output examples
- `INTEGRATION.md`: integration contract

The two CSV files are designed for this cross-journey proof. Haitham's original 20-case CSV remains unchanged and can continue to demonstrate the existing multi-journey interface.

## Run

Requires Node 22.13 or newer. In this directory:

```sh
npm test
npm run demo
npm start
```

The server starts at `http://127.0.0.1:8788`. Opening the root address shows the available endpoints.

Assess the coordinated proof case:

```sh
curl -X POST http://127.0.0.1:8788/assess \
  -H 'Content-Type: application/json' \
  -d '{"case_id":"CJ-SYN-demo-00001"}'
```

Inference has no npm dependencies. Retraining requires the pinned Python packages in `requirements-training.txt`.

## Boundaries

- Synthetic data only
- No connection to live GOSI systems
- No automatic fraud confirmation or adverse action
- Missing linked evidence causes abstention
- Human specialist owns the case route
- Final investigated outcomes are not yet stored by this component
- No automatic conversion of a reviewed case into a rule or automatic retraining
- Haitham's business validation remains pending

Any feedback loop must store authorized outcomes, accumulate evidence, propose a candidate rule or model version, evaluate it offline, and obtain governance approval before activation.
