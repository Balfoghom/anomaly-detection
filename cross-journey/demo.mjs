import { writeFileSync } from "node:fs";
import cases from "./data/demo-cases.json" with { type: "json" };
import { assess } from "./inference/detector.mjs";

const output = cases.map((caseRecord) => ({
  caseId: caseRecord.id,
  scenario: caseRecord.family,
  synthetic: true,
  businessValidation: "Pending Haitham review",
  ...assess(caseRecord),
}));

console.table(
  output.map((result) => ({
    case: result.caseId,
    scenario: result.scenario,
    model: result.complete
      ? result.modelFlagged ? "flagged" : "not flagged"
      : "abstained",
    rules: result.complete
      ? result.ruleFlagged ? "triggered" : "not triggered"
      : "not assessed",
    percentile: result.percentile?.toFixed(1) ?? "none",
    route: result.route,
  })),
);

writeFileSync(
  new URL("./examples/demo-results.json", import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log("Detailed evidence written to examples/demo-results.json.");
console.log("The model score is synthetic review-pattern similarity, not fraud probability.");
