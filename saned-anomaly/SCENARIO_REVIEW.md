# Business review for Haitham — pending

All scenarios, feature windows and numeric thresholds below were created for simulation. None should be presented as validated SANED policy. Please mark each as accept / revise / reject and explain the needed changes.

| Scenario | Current provisional expectation | Business question | Decision / correction |
|---|---|---|---|
| Routine claim | Standard review | Does this reflect an ordinary pre-disbursement SANED claim? What normal variations are missing? | Pending |
| Repeated backdated amendments | Specialist review | Which amendment types, backdating periods and explanations matter? | Pending |
| Coordinated moderate changes | Specialist review | Is the joint claimant/employer/supervisor pattern plausible and relevant before payment? | Pending |
| Legitimate workforce reduction | Legitimate, despite unusual volume | What evidence distinguishes legitimate restructuring from activity warranting investigation? | Pending |
| Material wage increase | Specialist review | Which wage window and eligibility context should be considered? | Pending |
| Missing workforce reference | Complete evidence; no model score | Is this required information available at the assessment point, and who resolves missing data? | Pending |

Please also review:

- The six feature definitions in README.md, including 30-day, seven-day and 24-hour windows.
- Whether event counts should be distinct people, claims or transactions, and how corrections/duplicates should be handled.
- What qualifies as the relevant employer and supervisor comparison group.
- The provisional comparator thresholds: 4 amendments, 30 backdated days, 80% wage increase, 35 exclusions per 100 workers, 20 supervisor changes per 100 workers.
- Whether both unusually high and low behavior can be useful signals.
- Which controls must always force review, regardless of the anomaly score.
- What a specialist should do for each recommended route, including legitimate explanations.
- Which false alarms are most costly, and how much review capacity is available.

Review changes should be recorded before preparing a new evaluation dataset. Scenario labels mean “warrants review” versus “designed legitimate”; they do not establish confirmed fraud.
