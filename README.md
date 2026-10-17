# Madar AI detection models

This repository contains two separate trained AI capabilities for the synthetic hackathon prototype. Each model has its own code, fitted artifact, data contract, tests, and documentation.

## Repository map

```text
anomaly-detection/
├── README.md                 # This repository guide
├── MANAL_HANDOVER.md         # Application integration requirements
├── saned-anomaly/            # Single-journey SANED Isolation Forest
│   ├── inference/            # JavaScript model execution
│   ├── training/             # Reproducible Python training
│   ├── data/                 # Fitted model and synthetic evidence
│   ├── examples/             # Expected demonstration output
│   └── tests/                # Model parity and API tests
└── cross-journey/            # Multi-journey Random Forest
    ├── inference/            # JavaScript model execution
    ├── training/             # Reproducible Python training
    ├── data/                 # Fitted model and synthetic evidence
    ├── examples/             # Expected demonstration output
    └── tests/                # Model parity, data, and API tests
```

## Models

| Folder | Model | Reads | Main output |
|---|---|---|---|
| [`saned-anomaly/`](saned-anomaly/) | Isolation Forest | One synthetic SANED claimant history | Unusualness and recommended review route |
| [`cross-journey/`](cross-journey/) | Random Forest classifier | Connected synthetic employer and contributor events | Review-pattern similarity and recommended review route |

The models are complementary. The cross-journey model does not replace the SANED model, and their scores must not be averaged. Both keep trained-model flags separate from transparent comparator rules.

## Start here

- Manal and coding assistants: [`MANAL_HANDOVER.md`](MANAL_HANDOVER.md)
- SANED model details: [`saned-anomaly/README.md`](saned-anomaly/README.md)
- Cross-journey model details: [`cross-journey/README.md`](cross-journey/README.md)

## Run the checks

Requires Node.js 22.13 or newer. In each model folder:

```sh
npm test
npm run demo
```

Inference has no npm dependencies. Python is needed only to retrain a model.

## Boundaries

- Synthetic data only.
- Business scenario validation by Haitham remains pending.
- A model flag recommends review; it does not confirm fraud.
- Missing required evidence produces an abstention.
- Human outcomes do not automatically retrain a model or create a rule.
- No live GOSI system is connected.
