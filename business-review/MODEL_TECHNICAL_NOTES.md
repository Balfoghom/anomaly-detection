# Short technical notes for the Madar AI models

**Prepared:** 17 October 2026  
**Scope:** synthetic prototype only  
**Business boundary:** model outputs recommend handling routes. They do not confirm fraud, stop a payment, change a business rule, or replace human approval.

## 1. SANED single-journey anomaly model

### Model and purpose

- **Version:** `saned-if-20261016-v1`
- **Algorithm:** Isolation Forest with 100 fitted trees.
- **Purpose:** identify a claimant history that is unusual relative to the synthetic SANED reference population.
- **Model type:** unsupervised anomaly detection. Training uses routine synthetic histories rather than fraud labels.

### Input features

The detector derives six values from one synthetic SANED claimant history:

1. Amendments in the preceding 30 days.
2. Maximum backdating in days.
3. Hours since the latest amendment.
4. Wage percentage change.
5. Employer exclusions per 100 workers in the preceding 7 days.
6. Supervisor changes per 100 workers in the preceding day.

The case must also include a synthetic identifier, assessment time, positive workforce size, two valid wage records, and a SANED claim. Missing required evidence causes an abstention.

### Output, threshold, and route

- **Output score:** Isolation Forest unusualness. Higher means more unusual; it is not fraud probability.
- **Review threshold:** `0.6200281595573496`.
- **AI decision:** `modelFlagged` is true when the score reaches the threshold.
- **Combined prototype route:** incomplete evidence → `Complete evidence`; AI or comparator rule triggered → `Specialist review`; otherwise → `Standard review`.
- **Business display:** map `Standard review` to **Routine processing**, `Complete evidence` to **Additional verification / Data Quality Issue**, and `Specialist review` to **Specialist investigation**.

### Synthetic training and testing

- 2,400 synthetic routine histories for training.
- 800 separate synthetic routine or legitimate histories for threshold calibration.
- Threshold fixed at the 97th percentile of the calibration scores.
- 600 held-out synthetic histories: 300 routine or legitimate and 300 expected-review scenarios.
- IDs are separated between training, calibration, and test populations.

Held-out synthetic results:

| Method | Correct routine | Review cases found | Review cases missed | Routine cases flagged | Synthetic accuracy |
|---|---:|---:|---:|---:|---:|
| Comparator rules | 286 / 300 | 200 / 300 | 100 | 14 | 81.0% |
| Isolation Forest | 284 / 300 | 221 / 300 | 79 | 16 | 84.2% |
| Rules OR Isolation Forest | 273 / 300 | 300 / 300 | 0 | 27 | 95.5% |

Expected versus actual scenario results for the Isolation Forest:

| Synthetic scenario | Expected handling | Actual AI result |
|---|---|---|
| 240 routine histories | Routine processing | 237 routine; 3 flagged |
| 60 legitimate workforce surges | Routine or contextual review | 47 routine; 13 flagged |
| 100 repeated retrospective changes | Specialist investigation | 100 flagged |
| 100 coordinated moderate-change cases | Specialist investigation | 100 flagged; comparator rules flagged 0 |
| 100 material wage-change cases | Specialist investigation | 21 AI flagged; comparator rules flagged all 100 |

The hybrid works better than either component alone on the designed synthetic scenarios because rules detect the material wage cases that this anomaly model often does not flag.

### Explainability and reason codes

The result returns the observed value and synthetic 5th–95th percentile reference range for every feature. Values outside that range are marked as unusual. Comparator-rule reasons remain separate, such as repeated amendments or material backdating. These ranges help a reviewer understand context; they are not causal explanations or SHAP feature contributions.

### Current limitations

- Trained and tested only on generated synthetic data from the same scenario generator.
- No claim of production accuracy, fairness, savings, or generalisation to real GOSI cases.
- Exact SANED feature windows and comparator thresholds still require detailed business and Data & AI validation.
- The model can flag legitimate unusual activity and can miss relevant patterns; human review remains required.
- It does not learn automatically from a specialist decision.

## 2. Cross-journey pattern model

### Model and purpose

- **Version:** `madar-cross-journey-rf-20261017-v1`
- **Algorithm:** supervised Random Forest classifier with 180 fitted trees.
- **Purpose:** identify similarity to synthetic review patterns across connected employer and contributor events.
- **Business pattern confirmed:** Employer Registration → material Wage Change → Employment Exclusion, especially retrospective changes → SANED Request within a compressed period.

At minimum, events must link through contributor or beneficiary ID, employer ID or CR, and timestamps. Mobile number, IBAN, operator, device or channel, and WPS or payroll references may add relationship evidence when available.

### Input features

The detector derives sixteen values from the preceding 30-day connected history:

1. Distinct journeys.
2. Event count.
3. Linked contributor count.
4. Registration count.
5. Wage-change count.
6. Exclusion count.
7. SANED-request count.
8. Maximum wage percentage change.
9. Maximum retrospective period.
10. Hours since the latest wage change.
11. Maximum identifier reuse.
12. Cross-source conflict count.
13. Rule-override count.
14. Coordinated chain count.
15. Presence of the ordered registration → wage → exclusion → SANED chain.
16. Completed-chain duration.

### Output, threshold, and route

- **Output score:** similarity to the provisional synthetic review patterns. It is not fraud probability.
- **Review threshold:** `0.00038115594062715477`, fixed from the 97th percentile of a separate routine and legitimate calibration population.
- **AI decision:** use the returned `modelFlagged`; the application must not reimplement the threshold.
- **Recommended route:** incomplete linked evidence → `Complete evidence`; AI or comparator rule triggered → `Specialist review`; otherwise → `Standard review`.
- **Business meaning:** a flagged result creates a Specialist Review / Investigation route. It never represents confirmed fraud.

### Synthetic training and testing

- 6,700 connected synthetic histories for training: 4,000 routine or legitimate and 2,700 review-pattern histories.
- 1,000 separate routine or legitimate histories for calibration.
- 700 held-out histories: 400 routine or legitimate and 300 expected-review cases.
- Case, employer, contributor, and identifier IDs are separated between datasets.

Held-out synthetic results:

| Method | Correct routine | Review cases found | Review cases missed | Routine cases flagged | Synthetic accuracy |
|---|---:|---:|---:|---:|---:|
| Comparator rules | 400 / 400 | 150 / 300 | 150 | 0 | 78.6% |
| Cross-journey model | 384 / 400 | 300 / 300 | 0 | 16 | 97.7% |
| Rules OR cross-journey model | 384 / 400 | 300 / 300 | 0 | 16 | 97.7% |

Expected versus actual scenario results:

| Synthetic scenario | Expected handling | Actual AI result |
|---|---|---|
| 250 routine histories | Routine processing | 245 routine; 5 flagged |
| 75 legitimate-growth histories | Routine or contextual review | 64 routine; 11 flagged |
| 75 legitimate restructurings | Routine processing | 75 routine; 0 flagged |
| 150 coordinated cross-journey sequences | Specialist investigation | 150 AI flagged; comparator rules flagged 0 |
| 75 identifier-reuse networks | Specialist investigation | 75 AI flagged; comparator rules flagged 75 |
| 75 retrospective source-conflict cases | Specialist investigation | 75 AI flagged; comparator rules flagged 75 |

### Explainability and reason codes

The result keeps AI and comparator-rule decisions separate. It returns involved journeys, linked contributor count, detected chain count, deterministic reason sentences, and every feature beside its synthetic reference range. The main proof reason states that three linked contributors participate in the ordered sequence. Reference ranges provide context rather than exact causal attribution.

### Current limitations

- Supervised labels, threshold, and reported accuracy come from synthetic data designed for the prototype.
- The 97.7% figure applies only to the held-out synthetic test set; it is not production fraud accuracy.
- The very low numeric threshold reflects the fitted synthetic calibration distribution and must not be interpreted as a probability cutoff.
- Current event data covers the confirmed minimum linking fields and selected optional identifiers; it is not a production entity-resolution system.
- Scenario families do not represent every legitimate exception or fraud method.
- It recommends review only. It cannot confirm fraud, activate an indicator, change a business rule, adjust weights, or retrain automatically.

## Governance for both models

Case decisions follow:

`Assessment → Specialist Review → Evidence Collection / Cross-Check → Quality Review → Detection Manager Approval → Confirmed Fraud / Error / Legitimate / Further Investigation`

Risk indicators follow a separate process:

`Proposed Indicator → Fraud/Risk Specialist Review → Data & AI Validation → Historical or Sandbox Testing → Business Owner Approval → Technical Activation → Monitoring`

One specialist decision does not create a rule or train either model.
