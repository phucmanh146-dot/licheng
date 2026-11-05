"""Evidence-gated AI capability evaluation, kept separate from member proficiency.

Scores only deterministic, auditable properties of a model run. Semantic correctness
still requires an independent human reviewer; mock runs can never certify live ability.
"""
STEP_FIELDS = (
    "target_locator", "action", "reason", "expected_change",
    "output", "self_check", "failure_next", "capability_basis",
)
GENERIC_ACTIONS = {
    "分析材料", "分析文档", "仔细阅读原文", "阅读原文", "完成目标产物",
    "优化一下", "继续完善", "检查结果", "研究一下",
}


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _evidence_key(row):
    return (
        row.get("artifact_id"), row.get("artifact_version"),
        row.get("locator"), row.get("quote"),
    )


def evaluate_case(case, output, run):
    """Score one model result against a human-authored, versioned gold case.

    case: case_id, skill, expected_gap_ids, evidence_catalog, required_unknowns
    output: gaps[{gap_id,evidence_refs}], micro_steps[{...STEP_FIELDS}], unknowns[]
    run: mode (LIVE/SYNTHETIC/MOCK), model_id, trace_id, task_type
    """
    if not isinstance(case, dict) or not isinstance(output, dict) or not isinstance(run, dict):
        raise ValueError("case/output/run must be objects")

    components = {}
    hard_failures = []
    gaps = output.get("gaps") if isinstance(output.get("gaps"), list) else []
    steps = output.get("micro_steps") if isinstance(output.get("micro_steps"), list) else []
    unknowns = output.get("unknowns") if isinstance(output.get("unknowns"), list) else []

    schema_ok = isinstance(output.get("gaps"), list) and isinstance(output.get("micro_steps"), list) and isinstance(output.get("unknowns"), list)
    components["schema"] = 10 if schema_ok else 0

    expected = set(case.get("expected_gap_ids", []))
    actual = {g.get("gap_id") for g in gaps if isinstance(g, dict) and _text(g.get("gap_id"))}
    if expected or actual:
        precision = len(expected & actual) / max(1, len(actual))
        recall = len(expected & actual) / max(1, len(expected))
        gap_f1 = 2 * precision * recall / max(0.000001, precision + recall)
    else:
        gap_f1 = 1.0
    components["gap_match"] = round(20 * gap_f1, 2)

    allowed = {_evidence_key(row) for row in case.get("evidence_catalog", []) if isinstance(row, dict)}
    refs = [ref for gap in gaps if isinstance(gap, dict)
            for ref in (gap.get("evidence_refs") or []) if isinstance(ref, dict)]
    matched = sum(_evidence_key(ref) in allowed for ref in refs)
    evidence_score = matched / max(1, len(refs)) if refs else 0
    components["evidence_grounding"] = round(25 * evidence_score, 2)
    if any(_evidence_key(ref) not in allowed for ref in refs):
        hard_failures.append("unsupported_or_wrong_version_evidence")
    if any(not _text(ref.get("artifact_id")) or type(ref.get("artifact_version")) is not int
           or not _text(ref.get("locator")) or not _text(ref.get("quote")) for ref in refs):
        hard_failures.append("incomplete_evidence_locator")

    required_unknowns = set(case.get("required_unknowns", []))
    reported_unknowns = {x for x in unknowns if _text(x)}
    unknown_recall = (len(required_unknowns & reported_unknowns) / max(1, len(required_unknowns))
                      if required_unknowns else 1.0)
    components["uncertainty_calibration"] = round(15 * unknown_recall, 2)
    if required_unknowns - reported_unknowns:
        hard_failures.append("required_unknown_not_reported")

    if steps:
        good = 0
        for step in steps:
            if not isinstance(step, dict):
                continue
            action = step.get("action", "").strip() if isinstance(step.get("action"), str) else ""
            fields_ok = all(_text(step.get(field)) for field in STEP_FIELDS)
            version = step.get("input_version")
            version_ok = (isinstance(version, dict) and _text(version.get("artifact_id"))
                          and type(version.get("artifact_version")) is int and version["artifact_version"] > 0)
            specific = action.casefold() not in GENERIC_ACTIONS and len(action) >= 8
            if fields_ok and version_ok and specific:
                good += 1
        components["action_specificity"] = round(15 * good / len(steps), 2)
    else:
        components["action_specificity"] = 0

    provenance_ok = run.get("mode") == "LIVE" and _text(run.get("model_id")) and _text(run.get("trace_id"))
    components["live_provenance"] = 15 if provenance_ok else 0

    raw_score = round(sum(components.values()), 2)
    score = min(raw_score, 49) if hard_failures else raw_score
    return {
        "case_id": case.get("case_id", "UNNAMED"),
        "skill": case.get("skill", "unspecified"),
        "task_type": run.get("task_type", "unspecified"),
        "score": score,
        "raw_score": raw_score,
        "components": components,
        "hard_failures": sorted(set(hard_failures)),
        "run_mode": run.get("mode", "UNKNOWN"),
        "model_id": run.get("model_id"),
        "trace_id": run.get("trace_id"),
        "human_review_required": True,
        "execution_allowed": False,
        "certification_status": "pending_independent_human_review" if provenance_ok else "not_live_evidence",
        "note": "结构、引用和不确定性分数不是语义正确率；模型自评不能替代独立人工复核。",
    }


def model_skill_profile(records, skill):
    """Certify model capability per skill only from distinct LIVE, human-reviewed cases."""
    key = str(skill or "").strip().casefold()
    valid = [
        row for row in records if isinstance(row, dict)
        and str(row.get("skill", "")).strip().casefold() == key
        and row.get("run_mode") == "LIVE"
        and _text(row.get("model_id"))
        and _text(row.get("trace_id"))
        and _text(row.get("task_type"))
        and row.get("human_reviewed") is True
        and _text(row.get("reviewer_id"))
        and (not _text(row.get("executor_id")) or row.get("reviewer_id") != row.get("executor_id"))
        and row.get("hard_failures") == []
        and isinstance(row.get("score"), (int, float))
        and 0 <= row["score"] <= 100
        and _text(row.get("case_id"))
    ]
    by_case = {}
    for row in valid:
        by_case[row["case_id"]] = row
    rows = list(by_case.values())
    average = sum(row["score"] for row in rows) / len(rows) if rows else None
    task_types = {row.get("task_type") for row in rows if _text(row.get("task_type"))}

    if len(rows) < 5:
        level = "unverified"
    elif average < 70:
        level = "blocked"
    elif average < 80:
        level = "draft_only"
    elif average < 90:
        level = "supervised"
    elif len(rows) >= 10 and len(task_types) >= 3 and average >= 95:
        level = "validated_bounded"
    else:
        level = "validated_assisted"

    return {
        "skill": skill,
        "level": level,
        "live_human_reviewed_cases": len(rows),
        "task_type_count": len(task_types),
        "average_score": round(average, 2) if average is not None else None,
        "basis": "distinct_live_cases_with_independent_human_review",
        "not_a_global_model_rank": True,
    }


def match_support(model_profile, member_profile, risk="normal"):
    """Choose help intensity without confusing model capability and human skill."""
    model_level = model_profile.get("level", "unverified")
    member_level = member_profile.get("level", "unverified")
    if model_level in {"unverified", "blocked", "draft_only"}:
        mode = "human_led_ai_suggestions_only"
    elif member_level in {"unverified", "needs_support"}:
        mode = "guided_practice_with_human_check"
    elif member_level == "guided":
        mode = "stepwise_execution_with_feedback"
    elif member_level == "independent":
        mode = "independent_execution_with_sampling"
    elif member_level == "transfer":
        mode = "transfer_task_with_peer_review"
    else:
        mode = "guided_practice_with_human_check"

    return {
        "model_skill_level": model_level,
        "member_skill_level": member_level,
        "support_mode": mode,
        "human_review_required": risk in {"high", "critical"} or mode != "independent_execution_with_sampling",
        "permission_note": "AI validated does not mean the member has the skill; member evidence does not certify the model.",
    }
