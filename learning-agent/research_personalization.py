"""Evidence-based research personalization; self-report never establishes proficiency."""
from collections import Counter

LEVELS = ("unverified", "guided", "independent", "transfer")
SUPPORT_MODES = {
    "unverified": "diagnostic_trial",
    "needs_support": "targeted_reteach",
    "guided": "checklist_and_feedback",
    "independent": "independent_execution",
    "transfer": "stretch_and_peer_review",
}


def capability_profile(member, skill):
    """Infer a conservative support level from confirmed, artifact-backed records only.

    A passed self-report is not enough: evidence_confirmed must be true and each
    record must identify an artifact version and criterion. Transfer requires an
    explicitly recorded transfer check; the model cannot infer it.
    """
    key = str(skill or "").strip().casefold()
    records = [
        row for row in member.get("capability_evidence", [])
        if isinstance(row, dict)
        and str(row.get("capability", "")).strip().casefold() == key
        and row.get("evidence_confirmed") is True
        and isinstance(row.get("criterion"), str) and row["criterion"].strip()
        and isinstance(row.get("artifact_id"), str) and row["artifact_id"].strip()
        and type(row.get("artifact_version")) is int and row["artifact_version"] > 0
    ]
    if not records:
        level = "unverified"
        passed = []
    else:
        latest = records[-1]
        passed = [row for row in records if row.get("passed") is True]
        if latest.get("passed") is not True:
            level = "needs_support"
        else:
            distinct_tasks = {
                row.get("task_id") or f'{row["artifact_id"]}:v{row["artifact_version"]}'
                for row in passed
            }
            if len(distinct_tasks) >= 3 and any(row.get("transfer_verified") is True for row in passed):
                level = "transfer"
            elif len(distinct_tasks) >= 2:
                level = "independent"
            else:
                level = "guided"
    support = SUPPORT_MODES[level]
    return {
        "level": level,
        "support_mode": support,
        "confirmed_evidence_count": len(records),
        "passed_evidence_count": len(passed),
        "basis": "artifact_backed_member_records" if records else "no_confirmed_capability_evidence",
        "not_a_global_student_rank": True,
    }


def research_route(member, required_capabilities):
    """Return a per-skill support map; never collapse a learner to one global rank."""
    return {
        skill: capability_profile(member, skill)
        for skill in dict.fromkeys(str(x).strip() for x in required_capabilities if str(x).strip())
    }
