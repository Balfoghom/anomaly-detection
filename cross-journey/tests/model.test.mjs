import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import cases from "../data/demo-cases.json" with { type: "json" };
import evaluation from "../data/evaluation.json" with { type: "json" };
import evaluationCases from "../data/evaluation-cases.json" with { type: "json" };
import fixtures from "../data/parity-fixtures.json" with { type: "json" };
import { assess, extractFeatures, model, scoreVector } from "../lib/detector.mjs";

test("model artifact matches its evaluation fingerprint", () => {
  const digest = createHash("sha256")
    .update(readFileSync(new URL("../data/model.json", import.meta.url)))
    .digest("hex");
  assert.equal(digest, evaluation.artifactSha256);
});

test("JavaScript feature extraction and scoring match Python fixtures", () => {
  for (const fixture of fixtures) {
    const vector = extractFeatures(fixture.case);
    vector.forEach((value, index) => assert.ok(Math.abs(value - fixture.features[index]) < 1e-9));
    assert.ok(Math.abs(scoreVector(vector) - fixture.score) < 1e-10);
  }
});

test("all held-out scores reproduce Python and the model metrics", () => {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const caseResult of evaluationCases) {
    const score = scoreVector(caseResult.features);
    assert.ok(Math.abs(score - caseResult.pythonScore) < 1e-10);
    const flagged = score >= model.threshold;
    const key = caseResult.expectedReview
      ? flagged ? "tp" : "fn"
      : flagged ? "fp" : "tn";
    counts[key] += 1;
  }
  const expected = evaluation.metrics["Cross-journey pattern model only"];
  for (const key of Object.keys(counts)) assert.equal(counts[key], expected[key]);
});

test("proof case links one employer and contributors across three journeys", () => {
  const proof = cases.find((caseRecord) => caseRecord.family === "coordinated_claim_sequence");
  assert.deepEqual(
    [...new Set(proof.events.map((event) => event.journey))].sort(),
    ["Contribution & Wage", "Employer Registration", "SANED"],
  );
  assert.equal(new Set(proof.events.map((event) => event.employerId)).size, 1);
  const subjects = new Set(proof.events.map((event) => event.subjectId));
  assert.equal(subjects.size, 3);
  for (const subject of subjects) {
    assert.ok(new Set(proof.events.filter((event) => event.subjectId === subject).map((event) => event.journey)).size >= 3);
  }
});

test("proof case is found by the trained model while comparator rules remain quiet", () => {
  const result = assess(cases.find((caseRecord) => caseRecord.family === "coordinated_claim_sequence"));
  assert.equal(result.modelFlagged, true);
  assert.equal(result.ruleFlagged, false);
  assert.equal(result.route, "Specialist review");
  assert.equal(result.involvedJourneys.length, 3);
});

test("future events cannot leak into assessment", () => {
  const routine = structuredClone(cases.find((caseRecord) => caseRecord.family === "routine"));
  const before = assess(routine).score;
  routine.events.push({
    eventId: "EVT-FUTURE",
    journey: "Contribution & Wage",
    type: "wage",
    recordedAt: routine.asOf + 1,
    subjectId: routine.events[0].subjectId,
    employerId: routine.employerId,
    previousAmount: 6000,
    amount: 600000,
    sourceConflict: false,
    ruleOverride: false,
  });
  assert.equal(assess(routine).score, before);
});

test("array order and descriptive labels do not affect inference", () => {
  const proof = structuredClone(cases.find((caseRecord) => caseRecord.family === "coordinated_claim_sequence"));
  const before = assess(proof).score;
  proof.family = "routine";
  proof.expectedReview = false;
  proof.events.reverse();
  assert.equal(assess(proof).score, before);
});

test("missing linked entity evidence causes abstention", () => {
  const result = assess(cases.find((caseRecord) => caseRecord.family === "missing"));
  assert.equal(result.complete, false);
  assert.equal(result.percentile, null);
  assert.equal(result.route, "Complete evidence");
});

test("Data Intake event CSV carries the assessment time needed for the 30-day window", () => {
  const rows = readFileSync(
    new URL("../data/cross-journey-demo-events.csv", import.meta.url),
    "utf8",
  ).trim().split(/\r?\n/);
  const header = rows[0].split(",");
  const caseIndex = header.indexOf("case_id");
  const assessmentIndex = header.indexOf("assessment_time");
  assert.ok(caseIndex >= 0);
  assert.ok(assessmentIndex >= 0);
  for (const row of rows.slice(1)) {
    const columns = row.split(",");
    assert.match(columns[caseIndex], /^CJ-SYN-demo-/);
    assert.equal(columns[assessmentIndex], "1792195200000");
  }
});
