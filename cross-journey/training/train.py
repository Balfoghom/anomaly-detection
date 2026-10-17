"""Train the cross-journey proof using synthetic, connected entity histories only."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import RandomForestClassifier


OUT = Path(__file__).resolve().parents[1] / "data"
ASSESSMENT_TIME = 1792195200000  # 17 October 2026 00:00:00 UTC
DAY = 86_400_000
HOUR = 3_600_000

FEATURE_NAMES = [
    "Distinct journeys in 30 days",
    "Events in 30 days",
    "Linked contributors in 30 days",
    "Registrations in 30 days",
    "Wage changes in 30 days",
    "Exclusions in 30 days",
    "SANED requests in 30 days",
    "Maximum wage change (%)",
    "Maximum retroactive days",
    "Hours since latest wage change (log1p)",
    "Maximum identifier reuse",
    "Cross-source conflicts",
    "Rule overrides",
    "Coordinated chain count",
    "Registration-wage-exclusion-SANED chain",
    "Completed chain span (days)",
]

JOURNEYS = {
    "registration": "Employer Registration",
    "wage": "Contribution & Wage",
    "exclusion": "Employer Registration",
    "claim": "SANED",
    "payment": "Benefit Payments",
    "retirement": "Retirement",
    "maternity": "Maternity Benefit",
}


def add_event(case, kind, days_ago, subject, rng, **extra):
    """Append one timestamped synthetic event to a connected case history."""
    event = {
        "eventId": f"EVT-{case['id']}-{len(case['events']) + 1:03d}",
        "journey": JOURNEYS[kind],
        "type": kind,
        "recordedAt": int(case["asOf"] - days_ago * DAY),
        "subjectId": subject,
        "employerId": case["employerId"],
        "sourceConflict": False,
        "ruleOverride": False,
    }
    event.update(extra)
    case["events"].append(event)


def make_case(rng, index, family="routine", split="train"):
    """Generate one connected employer/contributor history for a scenario family."""
    case_id = f"CJ-SYN-{split}-{index:05d}"
    employer = f"EMP-SYN-{split}-{index:05d}"
    case = {
        "id": case_id,
        "synthetic": True,
        "asOf": ASSESSMENT_TIME,
        "employerId": employer,
        "family": family,
        "split": split,
        "events": [],
    }
    subjects = [f"CTR-SYN-{split}-{index:05d}-{n:02d}" for n in range(1, 13)]

    if family == "missing":
        case["employerId"] = None
        add_event(case, "claim", 0, subjects[0], rng)
        return case

    if family == "routine":
        registrations = int(rng.integers(0, 3))
        wages = int(rng.integers(1, 4))
        exclusions = int(rng.integers(0, 3))
        for n in range(registrations):
            add_event(case, "registration", float(rng.uniform(12, 29)), subjects[n], rng)
        for n in range(wages):
            pct = float(rng.uniform(-8, 20))
            add_event(
                case,
                "wage",
                float(rng.uniform(8, 27)),
                subjects[n % max(1, registrations, 2)],
                rng,
                previousAmount=6000,
                amount=round(6000 * (1 + pct / 100), 2),
            )
        for n in range(exclusions):
            recorded_days = float(rng.uniform(3, 25))
            retro_days = float(rng.uniform(0, 8))
            add_event(
                case,
                "exclusion",
                recorded_days,
                subjects[n],
                rng,
                effectiveAt=int(case["asOf"] - (recorded_days + retro_days) * DAY),
            )
        add_event(case, "claim", 0, subjects[0], rng)

    elif family == "legitimate_growth":
        registrations = int(rng.integers(5, 8))
        for n in range(registrations):
            add_event(case, "registration", float(rng.uniform(8, 29)), subjects[n], rng)
        for n in range(int(rng.integers(3, 7))):
            pct = float(rng.uniform(5, 28))
            add_event(
                case,
                "wage",
                float(rng.uniform(3, 20)),
                subjects[n],
                rng,
                previousAmount=6000,
                amount=round(6000 * (1 + pct / 100), 2),
            )
        add_event(case, "claim", 0, subjects[0], rng)

    elif family == "legitimate_restructuring":
        for n in range(int(rng.integers(3, 8))):
            recorded_days = float(rng.uniform(2, 25))
            retro_days = float(rng.uniform(0, 7))
            add_event(
                case,
                "exclusion",
                recorded_days,
                subjects[n],
                rng,
                effectiveAt=int(case["asOf"] - (recorded_days + retro_days) * DAY),
            )
        add_event(case, "claim", 0, subjects[0], rng)

    elif family == "coordinated_claim_sequence":
        # Each individual signal remains below the provisional comparator rules.
        retro_days = float(rng.uniform(15, 28))
        for n in range(3):
            add_event(case, "registration", float(rng.uniform(22, 28)), subjects[n], rng)
        for n in range(3):
            pct = float(rng.uniform(25, 55))
            add_event(
                case,
                "wage",
                float(rng.uniform(13, 19)),
                subjects[n],
                rng,
                previousAmount=6000,
                amount=round(6000 * (1 + pct / 100), 2),
            )
        for n in range(3):
            recorded_days = float(rng.uniform(5, 10))
            add_event(
                case,
                "exclusion",
                recorded_days,
                subjects[n],
                rng,
                effectiveAt=int(case["asOf"] - (recorded_days + retro_days) * DAY),
                sourceConflict=bool(n == 0 and rng.random() < 0.45),
            )
        for n in range(3):
            add_event(case, "claim", float(2 - n), subjects[n], rng)

    elif family == "identifier_reuse_network":
        identifier = f"IBAN-SYN-{split}-{index:05d}"
        for n in range(int(rng.integers(5, 9))):
            add_event(
                case,
                "payment",
                float(rng.uniform(1, 18)),
                subjects[n],
                rng,
                identifierId=identifier,
            )
        add_event(case, "claim", 0, subjects[0], rng, identifierId=identifier)

    elif family == "retroactive_source_conflict":
        for n in range(2):
            pct = float(rng.uniform(35, 70))
            days_ago = float(rng.uniform(4, 12))
            add_event(
                case,
                "wage",
                days_ago,
                subjects[n],
                rng,
                previousAmount=6000,
                amount=round(6000 * (1 + pct / 100), 2),
                effectiveAt=int(case["asOf"] - (days_ago + float(rng.uniform(35, 80))) * DAY),
                sourceConflict=True,
                ruleOverride=bool(n == 0),
            )
        add_event(case, "retirement", 3, subjects[0], rng, sourceConflict=True)
        add_event(case, "claim", 0, subjects[0], rng)
    else:
        raise ValueError(f"Unknown family: {family}")

    case["events"].sort(key=lambda event: event["recordedAt"])
    return case


def ordered_chain(events):
    """Find registration → wage → exclusion → claim in chronological order."""
    times = {
        kind: sorted(event["recordedAt"] for event in events if event["type"] == kind)
        for kind in ("registration", "wage", "exclusion", "claim")
    }
    for registration in times["registration"]:
        for wage in times["wage"]:
            if wage <= registration:
                continue
            for exclusion in times["exclusion"]:
                if exclusion <= wage:
                    continue
                for claim in times["claim"]:
                    if claim > exclusion:
                        return True, (claim - registration) / DAY
    return False, 30.0


def features(case):
    """Convert a connected history into the model's sixteen ordered features."""
    if not case.get("employerId") or not case.get("events"):
        return None
    events = [
        event
        for event in case["events"]
        if event["recordedAt"] <= case["asOf"]
        and event["recordedAt"] >= case["asOf"] - 30 * DAY
    ]
    claims = [event for event in events if event["type"] == "claim"]
    if not claims:
        return None
    wages = [event for event in events if event["type"] == "wage"]
    exclusions = [event for event in events if event["type"] == "exclusion"]
    identifier_counts = {}
    for event in events:
        identifier = event.get("identifierId")
        if identifier:
            identifier_counts.setdefault(identifier, set()).add(event["subjectId"])
    chain, chain_span = ordered_chain(events)
    chain_count = (
        min(
            sum(event["type"] == "registration" for event in events),
            len(wages),
            len(exclusions),
            len(claims),
        )
        if chain
        else 0
    )
    latest_wage_hours = (
        (case["asOf"] - max(event["recordedAt"] for event in wages)) / HOUR
        if wages
        else 30 * 24
    )
    wage_changes = [
        100 * (event["amount"] / event["previousAmount"] - 1)
        for event in wages
        if event.get("previousAmount", 0) > 0 and event.get("amount") is not None
    ]
    retroactive = [
        max(0.0, (event["recordedAt"] - event["effectiveAt"]) / DAY)
        for event in events
        if event.get("effectiveAt") is not None
    ]
    return [
        len({event["journey"] for event in events}),
        len(events),
        len({event["subjectId"] for event in events}),
        sum(event["type"] == "registration" for event in events),
        len(wages),
        len(exclusions),
        len(claims),
        max(wage_changes or [0.0]),
        max(retroactive or [0.0]),
        math.log1p(max(0.0, latest_wage_hours)),
        max([len(subjects) for subjects in identifier_counts.values()] or [0]),
        sum(bool(event.get("sourceConflict")) for event in events),
        sum(bool(event.get("ruleOverride")) for event in events),
        chain_count,
        int(chain),
        chain_span,
    ]


def comparator_rules(vector):
    """Return whether any transparent provisional threshold triggers review."""
    return (
        vector[3] >= 8
        or vector[6] >= 5
        or vector[7] >= 80
        or vector[8] >= 30
        or vector[10] >= 4
        or vector[11] >= 2
        or vector[12] >= 3
    )


def metric_counts(expected, predicted):
    """Calculate binary review-class detection counts and rates."""
    tp = sum(wanted and result for wanted, result in zip(expected, predicted))
    fp = sum(not wanted and result for wanted, result in zip(expected, predicted))
    fn = sum(wanted and not result for wanted, result in zip(expected, predicted))
    tn = sum(not wanted and not result for wanted, result in zip(expected, predicted))
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "accuracy": (tp + tn) / len(expected),
        "precision": tp / max(1, tp + fp),
        "recall": tp / max(1, tp + fn),
        "falsePositiveRate": fp / max(1, fp + tn),
    }


def generate_population(rng, split, counts):
    """Generate a partition with disjoint synthetic entity namespaces."""
    cases = []
    index = 0
    for family, count in counts:
        for _ in range(count):
            cases.append(make_case(rng, index, family, split))
            index += 1
    return cases


def write_demo_csvs(cases):
    """Write event-level upload data and separate case-level reference metadata."""
    event_fields = [
        "case_id",
        "assessment_time",
        "event_id",
        "recorded_at",
        "effective_at",
        "journey",
        "event_type",
        "subject_id",
        "employer_id",
        "identifier_id",
        "amount",
        "previous_amount",
        "source_conflict",
        "rule_override",
        "synthetic",
    ]
    with (OUT / "cross-journey-demo-events.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=event_fields, lineterminator="\n")
        writer.writeheader()
        for case in cases:
            for event in case["events"]:
                writer.writerow(
                    {
                        "case_id": case["id"],
                        "assessment_time": case["asOf"],
                        "event_id": event["eventId"],
                        "recorded_at": event["recordedAt"],
                        "effective_at": event.get("effectiveAt", ""),
                        "journey": event["journey"],
                        "event_type": event["type"],
                        "subject_id": event["subjectId"],
                        "employer_id": event.get("employerId", ""),
                        "identifier_id": event.get("identifierId", ""),
                        "amount": event.get("amount", ""),
                        "previous_amount": event.get("previousAmount", ""),
                        "source_conflict": int(bool(event.get("sourceConflict"))),
                        "rule_override": int(bool(event.get("ruleOverride"))),
                        "synthetic": 1,
                    }
                )
    with (OUT / "cross-journey-demo-cases.csv").open("w", newline="") as handle:
        fields = [
            "case_id",
            "family",
            "expected_review_provisional",
            "business_validation_status",
            "primary_journey",
            "employer_id",
            "event_count",
            "journey_count",
            "synthetic",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for case in cases:
            vector = features(case)
            writer.writerow(
                {
                    "case_id": case["id"],
                    "family": case["family"],
                    "expected_review_provisional": int(
                        case["family"]
                        in {
                            "coordinated_claim_sequence",
                            "identifier_reuse_network",
                            "retroactive_source_conflict",
                        }
                    ),
                    "business_validation_status": (
                        "Business pattern confirmed; model threshold remains a prototype assumption"
                    ),
                    "primary_journey": "SANED",
                    "employer_id": case.get("employerId") or "",
                    "event_count": len(case["events"]),
                    "journey_count": int(vector[0]) if vector else "",
                    "synthetic": 1,
                }
            )


def main():
    """Train, calibrate, evaluate, export, and generate reproducible demo data."""
    rng = np.random.default_rng(20261017)
    train_counts = [
        ("routine", 3200),
        ("legitimate_growth", 400),
        ("legitimate_restructuring", 400),
        ("coordinated_claim_sequence", 1500),
        ("identifier_reuse_network", 600),
        ("retroactive_source_conflict", 600),
    ]
    train = generate_population(
        rng,
        "train",
        train_counts,
    )
    calibration = generate_population(
        rng,
        "calibration",
        [("routine", 800), ("legitimate_growth", 100), ("legitimate_restructuring", 100)],
    )
    test_counts = [
        ("routine", 250),
        ("legitimate_growth", 75),
        ("legitimate_restructuring", 75),
        ("coordinated_claim_sequence", 150),
        ("identifier_reuse_network", 75),
        ("retroactive_source_conflict", 75),
    ]
    test = generate_population(rng, "test", test_counts)

    review_families = {
        "coordinated_claim_sequence",
        "identifier_reuse_network",
        "retroactive_source_conflict",
    }
    train_x = np.asarray([features(case) for case in train], dtype=np.float32)
    train_y = np.asarray([case["family"] in review_families for case in train], dtype=np.int8)
    calibration_x = np.asarray([features(case) for case in calibration], dtype=np.float32)
    test_x = np.asarray([features(case) for case in test], dtype=np.float32)

    model = RandomForestClassifier(
        n_estimators=180,
        max_depth=10,
        min_samples_leaf=6,
        max_features="sqrt",
        class_weight="balanced_subsample",
        random_state=20261017,
        n_jobs=1,
    ).fit(train_x, train_y)
    calibration_scores = sorted(model.predict_proba(calibration_x)[:, 1].tolist())
    threshold = float(np.nextafter(np.quantile(calibration_scores, 0.97), np.inf))

    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        trees.append(
            {
                "left": tree.children_left.tolist(),
                "right": tree.children_right.tolist(),
                "feature": tree.feature.tolist(),
                "threshold": tree.threshold.tolist(),
                "positive": [
                    float(value[0][1] / max(1e-12, value[0].sum()))
                    for value in tree.value
                ],
            }
        )

    artifact = {
        "version": "madar-cross-journey-rf-20261017-v1",
        "algorithm": "Random Forest cross-journey pattern classifier",
        "sklearnVersion": sklearn.__version__,
        "seed": 20261017,
        "features": FEATURE_NAMES,
        "trees": trees,
        "threshold": threshold,
        "calibrationScores": calibration_scores,
        "trainCount": len(train),
        "calibrationCount": len(calibration),
        "referenceMedian": np.median(train_x, axis=0).tolist(),
        "referenceP05": np.quantile(train_x, 0.05, axis=0).tolist(),
        "referenceP95": np.quantile(train_x, 0.95, axis=0).tolist(),
    }
    model_raw = json.dumps(artifact, separators=(",", ":"))
    (OUT / "model.json").write_text(model_raw)

    expected = [case["family"] in review_families for case in test]
    scores = model.predict_proba(test_x)[:, 1]
    ai = [bool(score >= threshold) for score in scores]
    rules = [bool(comparator_rules(vector)) for vector in test_x]
    combined = [rule or anomaly for rule, anomaly in zip(rules, ai)]

    report = {
        "modelVersion": artifact["version"],
        "artifactSha256": hashlib.sha256(model_raw.encode()).hexdigest(),
        "validation": "Supervised with provisional synthetic cross-journey labels; Haitham review pending",
        "train": len(train),
        "calibration": len(calibration),
        "test": len(test),
        "routineOrLegitimate": expected.count(False),
        "review": expected.count(True),
        "threshold": threshold,
        "thresholdMethod": "97th percentile of a separate routine and legitimate calibration population",
        "splitMethod": "Disjoint synthetic case, employer, contributor, and identifier IDs; common generator; no real-world generalisation claim",
        "metrics": {
            "Provisional rules only": metric_counts(expected, rules),
            "Cross-journey pattern model only": metric_counts(expected, ai),
            "Rules OR cross-journey AI": metric_counts(expected, combined),
        },
        "byScenario": {},
    }
    for family, _ in test_counts:
        indexes = [index for index, case in enumerate(test) if case["family"] == family]
        report["byScenario"][family] = {
            "count": len(indexes),
            "aiFlagged": sum(ai[index] for index in indexes),
            "ruleFlagged": sum(rules[index] for index in indexes),
        }
    (OUT / "evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    (OUT / "evaluation-cases.json").write_text(
        json.dumps(
            [
                {
                    "id": case["id"],
                    "family": case["family"],
                    "expectedReview": expected[index],
                    "features": features(case),
                    "pythonScore": float(scores[index]),
                }
                for index, case in enumerate(test)
            ],
            separators=(",", ":"),
        )
    )

    demo_families = [
        "routine",
        "coordinated_claim_sequence",
        "legitimate_restructuring",
        "identifier_reuse_network",
        "retroactive_source_conflict",
        "missing",
    ]
    demos = [make_case(rng, index, family, "demo") for index, family in enumerate(demo_families)]
    (OUT / "demo-cases.json").write_text(json.dumps(demos, separators=(",", ":")))
    write_demo_csvs(demos)

    parity = []
    for case in test[::19]:
        vector = features(case)
        parity.append(
            {
                "case": case,
                "features": vector,
                    "score": float(model.predict_proba(np.asarray([vector], dtype=np.float32))[0, 1]),
            }
        )
    (OUT / "parity-fixtures.json").write_text(json.dumps(parity, separators=(",", ":")))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
