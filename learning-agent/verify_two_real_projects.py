"""Strict gate for two real V1->V2 projects; never fabricates missing evidence."""
import argparse
import json
import team_orchestrator as team
import artifact_store


def inspect_project(project_id):
    project = team.state(project_id)
    artifacts = project.get("stored_artifacts", [])
    inputs = [row for row in artifacts if row.get("purpose", "input") == "input"]
    outputs = [row for row in artifacts if row.get("purpose") == "submission"]
    checks = {
        "real_v1_input_exists": bool(inputs),
        "real_v2_submission_exists": bool(outputs),
        "human_executor_declared": False,
        "independent_manual_review": False,
        "human_confirmation": False,
        "v1_v2_bytes_verified": False,
    }
    verified = []
    for row in inputs + outputs:
        doc = artifact_store.read(project, row["artifact_id"], row["artifact_version"])
        verified.append((row["artifact_id"], row["artifact_version"], doc["sha256"]))
    checks["v1_v2_bytes_verified"] = bool(inputs and outputs and verified)
    completed = []
    for task in (project.get("plan") or {}).get("tasks", []):
        submission = task.get("submission") or {}
        if not submission:
            continue
        matching = next((row for row in outputs
                         if row["artifact_id"] == submission.get("artifact_id")
                         and row["artifact_version"] == submission.get("artifact_version")), None)
        if not matching:
            continue
        executors = submission.get("executor_ids", [])
        checks["human_executor_declared"] = bool(executors) and submission.get("executor_record_source") == "declared"
        external = task.get("external_review") or {}
        packet = external.get("packet") or {}
        reviewer = packet.get("reviewer_id")
        checks["independent_manual_review"] = (
            external.get("source") == "A_handoff" and packet.get("method") == "manual"
            and bool(reviewer) and reviewer not in executors
            and bool(packet.get("criterion_results"))
            and all(row.get("evidence") for row in packet.get("criterion_results", []))
            and external.get("content_read_verified") is True
            and external.get("content_independently_verified") is True
        )
        human = task.get("review") or {}
        checks["human_confirmation"] = (
            task.get("status") == "completed" and human.get("action") == "approve"
            and human.get("reviewer_id") == reviewer and reviewer not in executors
            and human.get("artifact_id") == submission.get("artifact_id")
            and human.get("artifact_version") == submission.get("artifact_version")
        )
        if all((checks["human_executor_declared"], checks["independent_manual_review"],
                checks["human_confirmation"])):
            completed.append(task["task_id"])
    return {"project_id": project_id, "goal": project.get("goal"),
            "checks": checks, "verified_submission_tasks": completed,
            "passed": all(checks.values()) and bool(completed),
            "limitation": "成员编号是项目内身份声明；不能替代外部身份认证或真实业务效果审计"}


def verify(project_ids):
    if len(project_ids) != 2 or len(set(project_ids)) != 2:
        raise ValueError("必须提供两个不同的真实项目ID")
    results = [inspect_project(identifier) for identifier in project_ids]
    return {"projects": results, "passed": all(row["passed"] for row in results),
            "rule": "两个项目都必须有可读V1、真实V2、明确执行者、非执行者人工复核和人工确认"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", action="append", required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.project_id), ensure_ascii=False, indent=2))
