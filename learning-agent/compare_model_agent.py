"""Matched ordinary-LLM vs Agent diagnosis experiment on one real project.

The runner calls the configured live model twice. Human quality scoring and
provider-billed cost are intentionally not inferred from model self-evaluation.
"""
import argparse
import hashlib
import json
import os
import time
from pathlib import Path

import artifact_retrieval
import rescue_service as rescue
import team_ai
import team_orchestrator as team


def _estimate_cost(input_chars, output_chars):
    input_tokens = max(1, round(input_chars / 4))
    output_tokens = max(1, round(output_chars / 4))
    input_raw = os.getenv("SHANGAN_EXPERIMENT_INPUT_USD_PER_1M", "").strip()
    output_raw = os.getenv("SHANGAN_EXPERIMENT_OUTPUT_USD_PER_1M", "").strip()
    if input_raw and output_raw:
        input_price, output_price = float(input_raw), float(output_raw)
        cost = round(input_tokens * input_price / 1_000_000
                     + output_tokens * output_price / 1_000_000, 8)
        cost_source = "character_estimate_and_user_supplied_price_not_provider_bill"
    else:
        cost, cost_source = None, "PRICE_NOT_CONFIGURED"
    return {
        "input_tokens_estimate": input_tokens,
        "output_tokens_estimate": output_tokens,
        "estimated_cost_usd": cost,
        "cost_source": cost_source,
    }


def run(project_id, query):
    project = team.state(project_id)
    if project.get("mode") != "live" or not project.get("artifact_storage_required"):
        raise ValueError("对照实验只接受已导入真实材料的 live 项目")
    config = rescue.public_config()
    if not config.get("configured") or not config.get("verified"):
        raise ValueError("请先连接并测试真实模型；未验证模型不得进入对照实验")
    cfg = rescue.config_snapshot()
    input_refs = [row for row in project.get('stored_artifacts', [])
                  if row.get('purpose', 'input') == 'input']
    docs = team_ai.documents(project, refs=input_refs)
    material = [{
        "artifact_id": doc["artifact_id"], "artifact_version": doc["artifact_version"],
        "sha256": doc["sha256"],
        "units": [{"locator": unit["locator"], "text": unit["text"]} for unit in doc["units"]],
    } for doc in docs]
    baseline_payload = {
        "goal": project.get("goal"),
        "project_context": project.get("project_context"),
        "member_task_briefs": project.get("member_task_briefs"),
        "query": query,
        "source_materials": material,
        "instruction": "基于给定真实材料诊断当前问题；区分事实、推断和未知；给出证据位置和可执行的下一步。不得补造事实。",
    }
    baseline_messages = [
        {"role": "system", "content": "你是项目诊断助手。只使用输入材料，不得编造证据。"},
        {"role": "user", "content": team.agent.dump(baseline_payload)},
    ]
    baseline_input = baseline_messages[1]["content"]
    started = time.perf_counter()
    baseline_output = rescue.complete(baseline_messages, cfg)
    baseline_ms = round((time.perf_counter() - started) * 1000, 1)

    started = time.perf_counter()
    agent_preview = artifact_retrieval.diagnosis_preview({
        "project_id": project_id, "expected_version": project["version"],
        "query": query, "limit": 12, "filters": {"purpose": "input"},
    })
    agent_ms = round((time.perf_counter() - started) * 1000, 1)
    trace = agent_preview["diagnosis"].get("model_trace", {})
    trace_detail = team_ai.read_trace(project_id, trace.get("run_id", "")) if trace.get("run_id") else {}
    agent_input_chars = len(team.agent.dump(trace_detail.get("input", {})))
    agent_output_chars = sum(len(str(attempt.get("response_text", "")))
                             for attempt in trace_detail.get("attempts", []))
    if not agent_input_chars:
        agent_input_chars = len(team.agent.dump(agent_preview.get("retrieval", {})))
    if not agent_output_chars:
        agent_output_chars = len(team.agent.dump(agent_preview["diagnosis"]))

    return {
        "experiment_id": hashlib.sha256(
            (project_id + "|" + query + "|" + project["version"]).encode()).hexdigest()[:20],
        "project_id": project_id, "project_version": project["version"],
        "query": query, "model": cfg["model"],
        "same_model_config": True,
        "baseline": {
            "mode": "ordinary_llm_full_material_context",
            "elapsed_ms": baseline_ms, "input_sha256": hashlib.sha256(
                baseline_input.encode()).hexdigest(),
            "output": baseline_output,
            **_estimate_cost(len(baseline_input), len(baseline_output)),
        },
        "agent": {
            "mode": "agent_rag_retrieval_grounded_diagnosis",
            "elapsed_ms": agent_ms,
            "retrieval": agent_preview["retrieval"],
            "diagnosis": agent_preview["diagnosis"],
            "model_trace": trace,
            **_estimate_cost(agent_input_chars, agent_output_chars),
        },
        "human_quality_scores": None,
        "quality_scoring_status": "PENDING_HUMAN_REVIEW",
        "warning": "耗时为本次运行实测；字符估算成本不是供应商账单；质量必须由不知道模式的复核者按同一 rubric 评分。",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = run(args.project_id, args.query)
    target = Path(args.output).resolve()
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(target), "experiment_id": result["experiment_id"],
                      "baseline_ms": result["baseline"]["elapsed_ms"],
                      "agent_ms": result["agent"]["elapsed_ms"],
                      "quality_scoring_status": result["quality_scoring_status"]},
                     ensure_ascii=False, indent=2))
