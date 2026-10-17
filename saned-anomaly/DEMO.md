# Saturday review with Haitham

Purpose: show a real working anomaly detector and get business feedback. All examples are synthetic and provisional.

Run `npm run demo`. Read the table, or let Manal call `/assess` from her interface. `examples/demo-results.json` contains the actual detailed output and evidence for each example.

1. **Routine claim — `SYN-demo-00000`.** Model and rules do not flag. Explain that this is standard review, not an eligibility determination.
2. **Coordinated changes — `SYN-demo-00002`.** The model flags the combination while the individual comparator rules do not. Inspect its event-derived features. This is the clearest demonstration of the added AI capability.
3. **Legitimate workforce reduction — `SYN-demo-00003`.** The model flags this designed legitimate scenario. Show the false alarm and explain why human review matters.
4. **Material wage increase — `SYN-demo-00004`.** The model does not flag this case, but the comparator rule does. Existing controls must remain visible.
5. **Missing evidence — `SYN-demo-00005`.** No model score is returned. The route is evidence completion.
6. **Evaluation.** Model alone catches 221/300 designed review cases with 16/300 legitimate cases flagged; combined rules/model catches 300/300 with 27/300 legitimate cases flagged. These are simulation results, not validated fraud detection performance.

Useful wording: “We trained an Isolation Forest on synthetic SANED-style histories. It scores combinations of six event-derived features. We can demonstrate real inference and its limitations. We need your validation of the scenarios before claiming business value.”

Ask Haitham to review `SCENARIO_REVIEW.md`. Do not tune the model during the call to force the expected answers. Record corrections, version the generator and model, and use a new test set for the next evaluation.
