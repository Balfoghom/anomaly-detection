import model from "../data/model.json" with { type: "json" };

export { model };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ALLOWED_TYPES = new Set([
  "registration",
  "wage",
  "exclusion",
  "claim",
  "payment",
  "retirement",
  "maternity",
]);

function validSyntheticId(value, prefix) {
  return typeof value === "string" && value.startsWith(prefix);
}

function findOrderedChain(events) {
  const times = Object.fromEntries(
    ["registration", "wage", "exclusion", "claim"].map((type) => [
      type,
      events
        .filter((event) => event.type === type)
        .map((event) => event.recordedAt)
        .sort((a, b) => a - b),
    ]),
  );
  for (const registration of times.registration) {
    for (const wage of times.wage) {
      if (wage <= registration) continue;
      for (const exclusion of times.exclusion) {
        if (exclusion <= wage) continue;
        for (const claim of times.claim) {
          if (claim > exclusion) return { found: true, spanDays: (claim - registration) / DAY };
        }
      }
    }
  }
  return { found: false, spanDays: 30 };
}

export function extractFeatures(caseRecord) {
  if (
    !caseRecord ||
    caseRecord.synthetic !== true ||
    !validSyntheticId(caseRecord.id, "CJ-SYN-") ||
    !validSyntheticId(caseRecord.employerId, "EMP-SYN-") ||
    !Number.isFinite(caseRecord.asOf) ||
    !Array.isArray(caseRecord.events) ||
    caseRecord.events.length === 0
  ) {
    return null;
  }

  if (
    caseRecord.events.some(
      (event) =>
        !event ||
        !ALLOWED_TYPES.has(event.type) ||
        !Number.isFinite(event.recordedAt) ||
        !validSyntheticId(event.subjectId, "CTR-SYN-") ||
        event.employerId !== caseRecord.employerId ||
        typeof event.journey !== "string",
    )
  ) {
    return null;
  }

  const events = caseRecord.events.filter(
    (event) =>
      event.recordedAt <= caseRecord.asOf &&
      event.recordedAt >= caseRecord.asOf - 30 * DAY,
  );
  const claims = events.filter((event) => event.type === "claim");
  if (claims.length === 0) return null;
  const wages = events.filter((event) => event.type === "wage");
  if (
    wages.some(
      (event) =>
        !Number.isFinite(event.amount) ||
        !Number.isFinite(event.previousAmount) ||
        event.previousAmount <= 0,
    ) ||
    events.some(
      (event) => event.effectiveAt !== undefined && !Number.isFinite(event.effectiveAt),
    )
  ) {
    return null;
  }

  const exclusions = events.filter((event) => event.type === "exclusion");
  const identifierSubjects = new Map();
  for (const event of events) {
    if (!event.identifierId) continue;
    if (!validSyntheticId(event.identifierId, "IBAN-SYN-") &&
        !validSyntheticId(event.identifierId, "MOB-SYN-") &&
        !validSyntheticId(event.identifierId, "DEV-SYN-")) return null;
    if (!identifierSubjects.has(event.identifierId)) identifierSubjects.set(event.identifierId, new Set());
    identifierSubjects.get(event.identifierId).add(event.subjectId);
  }

  const chain = findOrderedChain(events);
  const count = (type) => events.filter((event) => event.type === type).length;
  const chainCount = chain.found
    ? Math.min(count("registration"), wages.length, exclusions.length, claims.length)
    : 0;
  const latestWageHours = wages.length
    ? (caseRecord.asOf - Math.max(...wages.map((event) => event.recordedAt))) / HOUR
    : 30 * 24;
  const wageChanges = wages.map(
    (event) => 100 * (event.amount / event.previousAmount - 1),
  );
  const retroactiveDays = events
    .filter((event) => event.effectiveAt !== undefined)
    .map((event) => Math.max(0, (event.recordedAt - event.effectiveAt) / DAY));

  const vector = [
    new Set(events.map((event) => event.journey)).size,
    events.length,
    new Set(events.map((event) => event.subjectId)).size,
    count("registration"),
    wages.length,
    exclusions.length,
    claims.length,
    wageChanges.length ? Math.max(...wageChanges) : 0,
    Math.max(0, ...retroactiveDays),
    Math.log1p(Math.max(0, latestWageHours)),
    Math.max(0, ...[...identifierSubjects.values()].map((subjects) => subjects.size)),
    events.filter((event) => Boolean(event.sourceConflict)).length,
    events.filter((event) => Boolean(event.ruleOverride)).length,
    chainCount,
    Number(chain.found),
    chain.spanDays,
  ];
  return vector.every(Number.isFinite) ? vector : null;
}

export function scoreVector(input) {
  if (!Array.isArray(input) || input.length !== model.features.length) {
    throw new TypeError(`Expected ${model.features.length} numeric features.`);
  }
  const vector = input.map(Math.fround);
  const treeScores = model.trees.map((tree) => {
    let node = 0;
    while (tree.left[node] !== -1) {
      node = vector[tree.feature[node]] <= tree.threshold[node]
        ? tree.left[node]
        : tree.right[node];
    }
    return tree.positive[node];
  });
  return treeScores.reduce((total, value) => total + value, 0) / treeScores.length;
}

export function evaluateRules(vector) {
  const reasons = [];
  if (vector[3] >= 8) reasons.push("Eight or more registrations in 30 days");
  if (vector[6] >= 5) reasons.push("Five or more SANED requests in 30 days");
  if (vector[7] >= 80) reasons.push("Wage increase of 80% or more");
  if (vector[8] >= 30) reasons.push("Retroactive change of 30 days or more");
  if (vector[10] >= 4) reasons.push("Identifier shared by four or more contributors");
  if (vector[11] >= 2) reasons.push("Two or more cross-source conflicts");
  if (vector[12] >= 3) reasons.push("Three or more rule overrides");
  return reasons;
}

function contextualFeatures(vector) {
  return vector.map((internalValue, index) => {
    const recency = index === 9;
    const display = (value) => recency ? Math.expm1(value) : value;
    return {
      name: model.features[index],
      value: display(internalValue),
      median: display(model.referenceMedian[index]),
      low: display(model.referenceP05[index]),
      high: display(model.referenceP95[index]),
      outsideReferenceRange:
        internalValue < model.referenceP05[index] ||
        internalValue > model.referenceP95[index],
    };
  });
}

export function assess(caseRecord) {
  const vector = extractFeatures(caseRecord);
  if (!vector) {
    return {
      modelVersion: model.version,
      complete: false,
      route: "Complete evidence",
      band: "Incomplete",
      percentile: null,
      reasons: ["Required synthetic entity or event evidence is missing. No model score was produced."],
      features: [],
    };
  }

  const score = scoreVector(vector);
  const percentile =
    (100 * model.calibrationScores.filter((value) => value <= score).length) /
    model.calibrationScores.length;
  const ruleReasons = evaluateRules(vector);
  const modelFlagged = score >= model.threshold;
  const involvedJourneys = [
    ...new Set(
      caseRecord.events
        .filter((event) => event.recordedAt <= caseRecord.asOf)
        .map((event) => event.journey),
    ),
  ];
  const chainCount = vector[13];
  const reasons = [
    modelFlagged
      ? "The trained cross-journey model found similarity to provisional review patterns."
      : "The trained cross-journey model did not cross the selected review threshold.",
  ];
  if (chainCount >= 2) {
    reasons.push(
      `${chainCount} linked contributors participate in a registration → wage → exclusion → SANED sequence.`,
    );
  }
  reasons.push(...ruleReasons);

  return {
    modelVersion: model.version,
    complete: true,
    score,
    percentile,
    modelFlagged,
    ruleFlagged: ruleReasons.length > 0,
    ruleReasons,
    involvedJourneys,
    linkedContributorCount: vector[2],
    route: modelFlagged || ruleReasons.length ? "Specialist review" : "Standard review",
    band: modelFlagged || ruleReasons.length ? "Review" : "Typical",
    features: contextualFeatures(vector),
    reasons,
    scoreBoundary:
      "The model score measures similarity to provisional synthetic review patterns. It is not a fraud probability.",
    explanationBoundary:
      "Reference ranges provide context; they are not causal explanations or exact feature contributions.",
  };
}
