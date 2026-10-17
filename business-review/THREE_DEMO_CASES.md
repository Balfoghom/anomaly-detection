# Three demonstration cases for business review

These cases are selected from the fitted model packages and use actual inference results. All evidence is synthetic. The requested review is whether each scenario and proposed handling route make business sense.

## Case 1 — normal SANED case

**Case ID:** `SYN-demo-00000`  
**Model:** SANED Isolation Forest `saned-if-20261016-v1`  
**Expected handling:** Routine processing  
**Actual result:** AI not flagged; comparator rules not triggered; returned route `Standard review`, displayed as **Routine processing**.

| Evidence | Actual value |
|---|---:|
| AI unusualness score | `0.5005322058161524` |
| Review threshold | `0.6200281595573496` |
| Amendments in 30 days | 1 |
| Maximum backdating | 0 days |
| Wage change | 8.52% |
| Employer exclusions per 100 workers | 5.88 |

**Reason:** the trained model does not find the combination unusual enough to cross its review threshold, and no comparator rule triggers.

**Business review requested:** confirm that the evidence is sufficient for routine handling and identify any missing normal variations.

## Case 2 — high-risk SANED case

**Case ID:** `SYN-demo-00001`  
**Model:** SANED Isolation Forest `saned-if-20261016-v1`  
**Expected handling:** Specialist Review / Investigation  
**Actual result:** AI flagged; comparator rules triggered; returned route `Specialist review`, displayed as **Specialist investigation**.

| Evidence | Actual value |
|---|---:|
| AI unusualness score | `0.6792435686865899` |
| Review threshold | `0.6200281595573496` |
| Percentile versus calibration cases | 99.875 |
| Amendments in 30 days | 5 |
| Maximum backdating | 70 days |
| Hours since latest amendment | 7.19 |
| Wage change | 13.18% |

**Reason codes:** unusual combination relative to the synthetic reference population; four or more amendments; backdating of 30 days or more.

**Business review requested:** confirm that the repeated retrospective amendments shortly before the SANED request are appropriate grounds for specialist investigation. The case is not labeled confirmed fraud.

## Case 3 — cross-journey AI-only detection

**Case ID:** `CJ-SYN-demo-00001`  
**Model:** cross-journey Random Forest `madar-cross-journey-rf-20261017-v1`  
**Expected handling:** Specialist Review / Investigation  
**Actual result:** AI flagged; comparator rules not triggered; returned route `Specialist review`, displayed as **Specialist investigation**.

The case links three synthetic contributors to `EMP-SYN-demo-00001` across Employer Registration, Contribution & Wage, and SANED. Each follows the ordered sequence:

`Registration → material wage change → retrospective exclusion → SANED request`

| Evidence | Actual value |
|---|---:|
| Synthetic review-pattern score | `1` |
| Review threshold | `0.00038115594062715477` |
| Linked contributors | 3 |
| Connected journeys | 3 |
| Total events in 30 days | 12 |
| Registrations / wage changes / exclusions / SANED requests | 3 / 3 / 3 / 3 |
| Maximum wage change | 45.48% |
| Maximum retrospective period | 15.72 days |
| Completed sequence duration | 23.50 days |
| Comparator-rule result | Not triggered |

**Reason code:** three linked contributors participate in the ordered registration → wage → exclusion → SANED sequence under the same employer.

**Business review requested:** confirm that the combination, links, order, and compressed timing are appropriate grounds for specialist investigation even though individual comparator thresholds remain quiet. The score is synthetic pattern similarity, not fraud probability.

## Evidence locations

- SANED source cases: `saned-anomaly/data/cases.json`
- SANED complete outputs: `saned-anomaly/examples/demo-results.json`
- Cross-journey source case: `cross-journey/data/demo-cases.json`
- Cross-journey event upload: `cross-journey/data/cross-journey-demo-events.csv`
- Cross-journey complete outputs: `cross-journey/examples/demo-results.json`
- Automated parity and behavior tests: `saned-anomaly/tests/` and `cross-journey/tests/`
