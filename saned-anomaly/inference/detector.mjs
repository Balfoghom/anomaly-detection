import model from "../data/model.json" with { type: "json" };

export { model };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ALLOWED_EVENT_TYPES = new Set([
  "wage",
  "amendment",
  "employer_exclusion",
  "supervisor_change",
  "claim",
]);

/**
 * Convert one validated SANED claimant history into the six numeric values used
 * by the fitted Isolation Forest. Returning null is an intentional abstention:
 * required evidence is missing or malformed, so the model must not invent a score.
 */
export function extractFeatures(caseRecord) {
  if (
    !caseRecord ||
    caseRecord.synthetic !== true ||
    typeof caseRecord.id !== "string" ||
    !caseRecord.id.startsWith("SYN-") ||
    !Number.isFinite(caseRecord.asOf) ||
    !Number.isInteger(caseRecord.workforce) ||
    caseRecord.workforce <= 0 ||
    !Array.isArray(caseRecord.events)
  ) {
    return null;
  }

  const invalidEvent = caseRecord.events.some(
    (event) =>
      !event ||
      !ALLOWED_EVENT_TYPES.has(event.type) ||
      !Number.isFinite(event.recordedAt) ||
      typeof event.subject !== "string" ||
      !event.subject.startsWith("SYN-"),
  );
  if (invalidEvent) return null;

  // Only evidence recorded by the assessment time may influence the result.
  const availableEvents = caseRecord.events.filter(
    (event) => event.recordedAt <= caseRecord.asOf,
  );
  const amendments = availableEvents.filter(
    (event) =>
      event.type === "amendment" &&
      event.subject === caseRecord.id &&
      event.recordedAt >= caseRecord.asOf - 30 * DAY,
  );
  const wages = availableEvents
    .filter(
      (event) => event.type === "wage" && event.subject === caseRecord.id,
    )
    .sort((left, right) => left.recordedAt - right.recordedAt);

  const hasClaim = availableEvents.some(
    (event) => event.type === "claim" && event.subject === caseRecord.id,
  );
  const invalidWage = wages.some(
    (event) => !Number.isFinite(event.amount) || event.amount <= 0,
  );
  const invalidAmendment = amendments.some(
    (event) => !Number.isFinite(event.effectiveAt),
  );
  if (!hasClaim || wages.length < 2 || invalidWage || invalidAmendment) {
    return null;
  }

  const latestAmendmentHours = amendments.length
    ? (caseRecord.asOf - Math.max(...amendments.map((event) => event.recordedAt))) / HOUR
    : 720;
  const previousWage = wages.at(-2).amount;
  const currentWage = wages.at(-1).amount;

  const vector = [
    amendments.length,
    Math.max(
      0,
      ...amendments.map(
        (event) => (event.recordedAt - event.effectiveAt) / DAY,
      ),
    ),
    Math.log1p(latestAmendmentHours),
    100 * (currentWage / previousWage - 1),
    100 * availableEvents.filter(
      (event) =>
        event.type === "employer_exclusion" &&
        event.recordedAt >= caseRecord.asOf - 7 * DAY,
    ).length / caseRecord.workforce,
    100 * availableEvents.filter(
      (event) =>
        event.type === "supervisor_change" &&
        event.recordedAt >= caseRecord.asOf - DAY,
    ).length / caseRecord.workforce,
  ];

  return vector.every(Number.isFinite) ? vector : null;
}

// Backward-compatible export for any integration that used the original name.
export const features = extractFeatures;

/**
 * Estimate the additional average path length for an unfinished Isolation
 * Forest leaf. This is the standard correction used by Isolation Forest.
 */
export function pathCorrection(sampleCount) {
  if (sampleCount <= 1) return 0;
  if (sampleCount === 2) return 1;
  return (
    2 * (Math.log(sampleCount - 1) + 0.5772156649015329) -
    2 * (sampleCount - 1) / sampleCount
  );
}

/**
 * Traverse every exported Isolation Forest tree and reproduce scikit-learn's
 * unusualness score. A higher value means more unusual, not more likely fraud.
 */
export function scoreVector(input) {
  if (!Array.isArray(input) || input.length !== model.features.length) {
    throw new TypeError(`Expected ${model.features.length} numeric features.`);
  }

  // scikit-learn trained on float32 input, so matching that conversion preserves parity.
  const vector = input.map(Math.fround);
  const depths = model.trees.map((tree) => {
    let node = 0;
    let depth = 0;
    while (tree.left[node] !== -1) {
      node = vector[tree.feature[node]] <= tree.threshold[node]
        ? tree.left[node]
        : tree.right[node];
      depth += 1;
    }
    return depth + pathCorrection(tree.samples[node]);
  });
  const averageDepth = depths.reduce((total, depth) => total + depth, 0) /
    model.trees.length;
  return 2 ** (-averageDepth / pathCorrection(model.maxSamples));
}

/**
 * Apply the transparent comparator thresholds. These rules are provisional
 * prototype controls and remain separate from the trained model result.
 */
export function evaluateComparatorRules(vector) {
  const reasons = [];
  if (vector[0] >= 4) reasons.push("Four or more claimant amendments in 30 days");
  if (vector[1] >= 30) reasons.push("Backdating of 30 days or more");
  if (vector[3] >= 80) reasons.push("Wage increase of 80% or more");
  if (vector[4] >= 35) reasons.push("Employer exclusion rate of 35% or more");
  if (vector[5] >= 20) reasons.push("Supervisor change rate of 20% or more");
  return reasons;
}

/**
 * Pair observed values with the synthetic reference ranges used for display.
 * These ranges provide context; they are not causal feature attributions.
 */
function contextualFeatures(vector) {
  return vector.map((internalValue, index) => {
    const isRecency = index === 2;
    const display = (value) => isRecency ? Math.expm1(value) : value;
    return {
      name: model.features[index],
      value: display(internalValue),
      median: display(model.referenceMedian[index]),
      low: display(model.referenceP05[index]),
      high: display(model.referenceP95[index]),
      unusual:
        internalValue < model.referenceP05[index] ||
        internalValue > model.referenceP95[index],
    };
  });
}

/**
 * Run the complete SANED assessment: validate evidence, extract features,
 * execute the fitted model, evaluate comparator rules, and recommend a route.
 * The route is advisory and never represents a confirmed fraud outcome.
 */
export function assess(caseRecord) {
  const vector = extractFeatures(caseRecord);
  if (!vector) {
    return {
      modelVersion: model.version,
      complete: false,
      route: "Complete evidence",
      band: "Incomplete",
      percentile: null,
      reasons: [
        "Required workforce or event evidence is missing. No model score was produced.",
      ],
      features: [],
    };
  }

  const score = scoreVector(vector);
  const percentile =
    100 * model.calibrationScores.filter((value) => value <= score).length /
    model.calibrationScores.length;
  const ruleReasons = evaluateComparatorRules(vector);
  const modelFlagged = score >= model.threshold;
  const needsReview = modelFlagged || ruleReasons.length > 0;

  return {
    modelVersion: model.version,
    complete: true,
    score,
    percentile,
    modelFlagged,
    ruleFlagged: ruleReasons.length > 0,
    ruleReasons,
    route: needsReview ? "Specialist review" : "Standard review",
    band: needsReview ? "Review" : "Typical",
    features: contextualFeatures(vector),
    reasons: [
      modelFlagged
        ? "The trained forest finds this combination unusual relative to its synthetic reference population."
        : "The trained forest did not flag this combination at the selected threshold.",
      ...ruleReasons,
    ],
    explanationBoundary:
      "Feature ranges provide context, not causal explanations or exact model contributions.",
  };
}
