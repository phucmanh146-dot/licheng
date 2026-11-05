"""Project-scoped, independently reviewed AI skill evaluation records."""
import json
import uuid
import ai_capability_evaluation as evaluator
import team_orchestrator as team


def init_schema():
    with team.connection() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS platform_ai_skill_evaluations(
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, skill TEXT NOT NULL, case_id TEXT NOT NULL,
            task_type TEXT NOT NULL, run_mode TEXT NOT NULL, model_id TEXT, trace_id TEXT,
            executor_id TEXT NOT NULL, reviewer_id TEXT, score REAL NOT NULL, raw_score REAL NOT NULL,
            components TEXT NOT NULL, hard_failures TEXT NOT NULL, human_reviewed INTEGER NOT NULL DEFAULT 0,
            review_pass INTEGER, review_note TEXT NOT NULL DEFAULT '', created REAL NOT NULL)""")


def create(project_id, executor_id, case, output, run):
    if not isinstance(case, dict) or not isinstance(output, dict) or not isinstance(run, dict):
        raise ValueError("case、output、run 必须是对象")
    skill, case_id = case.get("skill"), case.get("case_id")
    if not isinstance(skill, str) or not skill.strip() or not isinstance(case_id, str) or not case_id.strip():
        raise ValueError("评测必须绑定具体 skill 和唯一 case_id")
    mode = run.get("mode", "UNKNOWN")
    if mode not in ("LIVE", "SYNTHETIC", "MOCK"):
        raise ValueError("run.mode 只能是 LIVE/SYNTHETIC/MOCK")
    trusted_run = {**run, "executor_id": executor_id}
    result = evaluator.evaluate_case(case, output, trusted_run)
    identifier = uuid.uuid4().hex
    with team.connection() as c:
        c.execute("""INSERT INTO platform_ai_skill_evaluations
            (id,project_id,skill,case_id,task_type,run_mode,model_id,trace_id,executor_id,
             score,raw_score,components,hard_failures,created)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (identifier, project_id, result["skill"], result["case_id"], result["task_type"],
             result["run_mode"], result.get("model_id"), result.get("trace_id"), executor_id,
             result["score"], result["raw_score"], json.dumps(result["components"],ensure_ascii=False),
             json.dumps(result["hard_failures"],ensure_ascii=False), team.agent.time.time()))
    return {"evaluation_id": identifier, **result, "human_reviewed": False}


def review(project_id, evaluation_id, reviewer_id, semantic_pass, content_read_confirmed, note):
    if type(semantic_pass) is not bool or content_read_confirmed is not True:
        raise ValueError("必须明确语义复核结果，并确认已读取原文和模型输出")
    if not isinstance(note, str) or len(note.strip()) < 8:
        raise ValueError("请写至少8字的独立复核依据")
    with team.connection() as c:
        row = c.execute("SELECT * FROM platform_ai_skill_evaluations WHERE id=? AND project_id=?",
                        (evaluation_id, project_id)).fetchone()
        if not row:
            raise ValueError("AI评测记录不存在")
        if row["executor_id"] == reviewer_id:
            raise PermissionError("AI评测必须由非执行者独立复核")
        failures = json.loads(row["hard_failures"])
        if not semantic_pass and "human_semantic_review_failed" not in failures:
            failures.append("human_semantic_review_failed")
        c.execute("""UPDATE platform_ai_skill_evaluations
            SET reviewer_id=?,human_reviewed=1,review_pass=?,review_note=?,hard_failures=?
            WHERE id=? AND project_id=?""",
            (reviewer_id, int(semantic_pass), note.strip(), json.dumps(failures), evaluation_id, project_id))
    return {"ok": True, "evaluation_id": evaluation_id, "human_reviewed": True,
            "review_pass": semantic_pass, "eligible_for_model_profile": semantic_pass and not failures}


def profile(project_id, skill):
    if not isinstance(skill, str) or not skill.strip():
        raise ValueError("请指定 skill")
    with team.connection() as c:
        rows = [dict(r) for r in c.execute(
            "SELECT * FROM platform_ai_skill_evaluations WHERE project_id=? AND lower(skill)=lower(?)",
            (project_id, skill.strip())).fetchall()]
    records = []
    for row in rows:
        records.append({
            "skill": row["skill"], "case_id": row["case_id"], "task_type": row["task_type"],
            "run_mode": row["run_mode"], "model_id": row["model_id"], "trace_id": row["trace_id"],
            "executor_id": row["executor_id"], "reviewer_id": row["reviewer_id"],
            "human_reviewed": bool(row["human_reviewed"]) and row["review_pass"] == 1,
            "hard_failures": json.loads(row["hard_failures"]), "score": row["score"],
        })
    return evaluator.model_skill_profile(records, skill), [{
        "evaluation_id":r["id"],"case_id":r["case_id"],"task_type":r["task_type"],
        "run_mode":r["run_mode"],"model_id":r["model_id"],"trace_id":r["trace_id"],
        "score":r["score"],"hard_failures":json.loads(r["hard_failures"]),
        "human_reviewed":bool(r["human_reviewed"]),"review_pass":None if r["review_pass"] is None else bool(r["review_pass"]),
        "reviewer_id":r["reviewer_id"],"executor_id":r["executor_id"],"review_note":r["review_note"],
    } for r in rows]
