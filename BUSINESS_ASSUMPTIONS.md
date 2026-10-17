# Confirmed business assumptions for the synthetic prototype

**Business owner:** Haitham  
**Recorded:** 17 October 2026  
**Scope:** synthetic prototype only

These assumptions define expected handling routes. They do not confirm fraud and they do not validate the model for production use.

## Expected handling for the 20 summarized cases

| Expected handling | Cases |
|---|---|
| Routine processing | `TX-MAD-002`, `TX-MAD-008`, `TX-MAD-011`, `TX-MAD-014`, `TX-MAD-017`, `TX-MAD-020` |
| Additional verification | `TX-MAD-003`, `TX-MAD-006`, `TX-MAD-010`, `TX-MAD-013`, `TX-MAD-015`, `TX-MAD-019` |
| Specialist investigation | `TX-MAD-001`, `TX-MAD-004`, `TX-MAD-005`, `TX-MAD-007`, `TX-MAD-009`, `TX-MAD-012`, `TX-MAD-016`, `TX-MAD-018` |

Additional verification can include source validation, payment-account ownership checks, employer or WPS confirmation, missing-data completion, or Insurance Operations Audit review.

Specialist investigation creates a high-priority case for Fraud Prevention, Detection, or Inspection review. It is not a fraud-confirmation decision.

## Confirmed cross-journey pattern

The following is a realistic and useful pattern for the demonstration:

`Employer Registration → Wage Change → Employment Exclusion → SANED Request`

The prototype should link events through employer ID or CR, contributor or beneficiary ID, and, when available, mobile number, IBAN, device or channel, employer supervisor or operator, WPS or payroll reference, and event time.

Relevant concerns include a compressed event sequence, retrospective exclusion changes, unsupported material wage changes, several contributors following the same sequence under one employer, identifier reuse, unexplained overrides, and conflicting sources. The concern comes from the combination, order, relationships, and deviation from history. One event alone is not evidence of fraud.

## Case decision workflow

```text
Assessment
→ Specialist Review
→ Evidence Collection / Cross-Check
→ Quality Review
→ Detection Manager Approval
→ Confirmed Fraud / Error / Legitimate / Further Investigation
```

Incomplete or conflicting evidence should lead to `Data Quality Issue / Additional Verification`, not confirmed fraud.

## Risk-indicator workflow

```text
Proposed Indicator
→ Fraud/Risk Specialist Review
→ Data & AI Validation
→ Historical or Sandbox Testing
→ Business Owner Approval
→ Technical Activation
→ Monitoring
```

This workflow is separate from deciding an individual case. Recurring confirmed outcomes may support a proposed indicator, but the system must not activate a rule, change weights, or retrain from one decision.

`New Assessment` means a new incoming or test case. It is not an indicator-approval action. Proposed indicators belong in a separate Risk Indicator Governance workflow or page.

## Validation boundary

Haitham's response confirms the expected handling of the 20 summarized cases and the business relevance of the cross-journey pattern. The fitted model's exact threshold, weights, synthetic accuracy, and production performance remain separate Data & AI validation matters.
