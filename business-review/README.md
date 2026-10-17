# Haitham business-review package

This folder contains the short technical evidence requested before final application integration.

- `MODEL_TECHNICAL_NOTES.md`: algorithm, features, outputs, data, evaluation, explanations, and limitations for both fitted models.
- `THREE_DEMO_CASES.md`: the three scenarios requested for business review, using actual model outputs.
- `three-demo-cases-summary.csv`: machine-readable summary for the application or review tracker.

All cases are synthetic. Expected handling is a review route, not a fraud label. The source cases and full outputs remain in each model package under `data/` and `examples/`.

## Supporting evidence map

| Evidence | What it supports |
|---|---|
| Haitham's written business responses, recorded in `../BUSINESS_ASSUMPTIONS.md` | Business relevance, expected handling, minimum linking fields, and governance workflow |
| Fitted `data/model.json` artifacts | Proof that inference executes trained trees rather than a hardcoded UI score |
| `data/evaluation.json` and held-out cases | Synthetic-only test results and their boundaries |
| `tests/` | Python-to-JavaScript score parity, input safety, event-order behavior, and API behavior |
| `examples/demo-results.json` | Actual model outputs for the bundled synthetic demonstration cases |

These sources support different claims. A business email does not prove model accuracy, and a synthetic test does not prove production fraud performance.
