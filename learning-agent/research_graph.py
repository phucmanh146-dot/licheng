"""LangGraph research coach: retrieval, diagnosis, domain validation, plan, gate.

Every completed node is checkpointed with a fenced lease. Model outputs remain
candidates: publishing the preview and adopting a plan are explicit user actions.
"""
import copy
import logging
import threading
import time
from datetime import datetime, date
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
import artifact_retrieval
import artifact_store
import platform_store as store
import team_ai
import team_handoff
import team_orchestrator as team
import autoloop_signals
import universal_autoloop


class ResearchState(TypedDict, total=False):
    input: dict
    project: dict
    retrieval: dict
    documents: list
    diagnosis: dict
    plan: dict
    status: str


def read(state):
    p = team.current(state['input'])
    if p['mode'] != 'live':
        raise ValueError('工程运行只接收live项目；不把演示结果当模型成功')
    return {'project':p}


def retrieve(state):
    result = artifact_retrieval.select(state['project'], state['input']['query'], filters={'purpose':'input'})
    if not result['hits']:
        raise ValueError('NO_RETRIEVED_EVIDENCE')
    documents = {}
    for hit in result['hits']:
        key = (hit['artifact_id'], hit['artifact_version'])
        if key not in documents:
            original = artifact_store.read(state['project'], *key)
            documents[key] = {**original, 'units':[]}
        original = next(u for u in artifact_store.read(state['project'], *key)['units'] if u['locator'] == hit['locator'])
        documents[key]['units'].append(original)
    return {'retrieval':result, 'documents':list(documents.values())}


def diagnose(state):
    return {'diagnosis':team_ai.researcher(state['project'], state['documents'], state['retrieval'])}


def validate(state):
    # Reuse all prior version/member/evidence/history guards, without writing.
    p = team.diagnosis({**state['input'], 'diagnosis':state['diagnosis']}, persist=False)
    return {'project':p, 'diagnosis':p['diagnosis']}


def plan(state):
    candidate = team_handoff.planner(copy.deepcopy(state['diagnosis']), copy.deepcopy(state['project']))
    team.validate_plan(candidate, state['diagnosis'])
    team.protected(state['project']['plan'], candidate)
    return {'plan':candidate}


def gate(state):
    return {'status':'awaiting_confirmation'}


NODES = [('read_materials', read), ('hybrid_retrieval', retrieve),
         ('model_diagnosis', diagnose), ('evidence_validation', validate),
         ('plan_preview', plan), ('human_confirmation', gate)]


def build(run_id, token):
    graph = StateGraph(ResearchState)
    previous = START
    for name, function in NODES:
        def wrapped(state, node=name, fn=function):
            store.lease(run_id, token)
            # Revalidate project version even when restoring a checkpoint.
            team.current(state['input'])
            cached = store.cached_node(run_id, node)
            if cached is not None:
                store.event(run_id, node, 'restored', {})
                return cached
            store.event(run_id, node, 'started', {})
            started = time.monotonic()
            value = fn(state)
            store.checkpoint(run_id, token, node, value)
            store.event(run_id, node, 'completed', {'elapsed_ms':round((time.monotonic()-started)*1000)})
            return value
        graph.add_node(name, wrapped)
        graph.add_edge(previous, name)
        previous = name
    graph.add_edge(previous, END)
    return graph.compile()



def execute_schedule_event(run, payload):
    """Deterministic schedule-only path for DDL and unscheduled-task events.

    It reuses the last user-confirmed availability window. It does not rerun RAG
    or regenerate task content. If the saved availability is stale or absent,
    it stops at an approval/availability gate rather than inventing free time.
    """
    import copy
    import period_planner

    project_id = payload.get("project_id")
    project = team.state(project_id)
    if project.get("mode") != "live" or not project.get("plan") or project.get("plan_stale"):
        raise ValueError("SCHEDULE_EVENT_REQUIRES_LIVE_ADOPTED_PLAN")
    old_plan = project["plan"]
    saved = old_plan.get("replanning_context")
    reasons = []
    if not isinstance(saved, dict):
        reasons.append("尚未保存经过用户确认的可用时间窗；请先在周期安排页填写真实空档")
        result = {
            "preview_only": True, "auto_adopted": False, "approval_required": True,
            "approval_reasons": reasons, "needs_availability_update": True,
            "event_type": payload.get("event_type"), "expected_version": project["version"],
            "preserved_context": True,
        }
        store.event(run["id"], "schedule_capacity_gate", "waiting", {"reasons": reasons})
        store.finish(run["id"], run["lease_token"], "awaiting_confirmation", result)
        return result

    settings = copy.deepcopy(saved)
    now = datetime.now(period_planner.TZ).replace(second=0, microsecond=0)
    today = now.date()
    try:
        end = date.fromisoformat(settings.get("period_end", ""))
    except ValueError:
        end = today - period_planner.timedelta(days=1)
    if end < today:
        reasons.append("上次确认的可用时间窗已过期；需要刷新未来空档，不能把旧空档当成现在仍可用")
    settings["period_start"] = max(today, date.fromisoformat(settings.get("period_start", today.isoformat()))).isoformat()
    settings["windows"] = [x for x in settings.get("windows", []) if x.get("date", "") >= settings["period_start"]]
    settings["busy"] = [x for x in settings.get("busy", []) if x.get("date", "") >= settings["period_start"]]
    settings["full_dates"] = [x for x in settings.get("full_dates", []) if x >= settings["period_start"]]

    member_id = settings.get("member_id")
    tasks = old_plan.get("tasks", [])
    active = [t for t in tasks if t.get("status") not in ("completed", "pending_review")]
    owned = [t for t in active if member_id in (t.get("owner_ids") or [])]
    other_owner = [t.get("task_id") for t in active if member_id not in (t.get("owner_ids") or [])]
    if other_owner:
        reasons.append("有其他成员负责的未完成任务，需要按成员分别联合排程：" + "、".join(other_owner[:8]))
    if len(owned) > 100:
        reasons.append("当前负责人未完成任务超过100项，需要分批排程")
    settings["selected_task_ids"] = [t["task_id"] for t in owned[:100]]
    remaining = settings.get("remaining_minutes") or {}
    for task in owned:
        if task.get("status") == "in_progress" and task["task_id"] not in remaining:
            # Conservative fallback: use the estimate upper bound, never assume
            # the task is nearly complete just because the user was interrupted.
            remaining[task["task_id"]] = task["estimate_minutes_range"][1]
    settings["remaining_minutes"] = remaining

    if reasons or not settings["windows"] or not settings["selected_task_ids"]:
        if not settings["windows"]:
            reasons.append("保存的周期内没有未来可用空档；请补充真实空档")
        if not settings["selected_task_ids"]:
            reasons.append("当前负责人没有可自动排程的未完成任务")
        result = {
            "preview_only": True, "auto_adopted": False, "approval_required": True,
            "approval_reasons": reasons, "needs_availability_update": True,
            "event_type": payload.get("event_type"), "expected_version": project["version"],
            "outside_member_tasks": other_owner,
        }
        store.event(run["id"], "schedule_capacity_gate", "waiting", {"reasons": reasons})
        store.finish(run["id"], run["lease_token"], "awaiting_confirmation", result)
        return result

    plan = period_planner.compute(project, settings, now=now)
    current = team.propose({
        "project_id": project["project_id"], "expected_version": project["version"],
        "plan": plan, "reason": "DDL/待安排事件触发：复用已确认空档，仅重排受影响任务",
    })
    summary = plan.get("schedule_summary") or {}
    result = {
        "preview_only": True, "auto_adopted": False,
        "approval_required": not bool(summary.get("fits")),
        "approval_reasons": (["当前容量不足，需用户决定是否暂缓低重要性任务"] if not summary.get("fits") else []),
        "proposal_id": current["proposal"]["id"], "expected_version": current["version"],
        "plan": plan, "event_type": payload.get("event_type"),
        "soft_defer_only": True, "never_delete_or_mark_complete": True,
    }
    if summary.get("fits"):
        adopted = team.apply_automated({
            "project_id": current["project_id"], "expected_version": current["version"],
            "proposal_id": current["proposal"]["id"],
        })
        result.update({
            "preview_only": False, "auto_adopted": True, "approval_required": False,
            "adopted_plan_version": adopted["plan"]["plan_version"],
            "expected_version": adopted["version"],
        })
        store.event(run["id"], "schedule_auto_adoption", "completed", {
            "plan_version": adopted["plan"]["plan_version"], "project_version": adopted["version"]})
        store.finish(run["id"], run["lease_token"], "succeeded", result)
    else:
        store.event(run["id"], "schedule_capacity_gate", "waiting", {
            "reasons": result["approval_reasons"], "unallocated": summary.get("unallocated", [])})
        store.finish(run["id"], run["lease_token"], "awaiting_confirmation", result)
    return result


def execute(run):
    import json
    stopped = threading.Event()
    def heartbeat():
        while not stopped.wait(20):
            try:
                store.lease(run['id'], run['lease_token'])
            except Exception:
                return
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        run_input = json.loads(run['input'])
        if run_input.get("event_type") in ("deadline.approaching", "task.unscheduled_triage"):
            execute_schedule_event(run, run_input)
            return
        value = build(run['id'], run['lease_token']).invoke({'input':run_input}, {'recursion_limit':12})
        team.current(value['input'])
        result = {k:value[k] for k in ('diagnosis','plan','retrieval')}
        result['expected_version'] = value['input']['expected_version']
        result['preview_only'] = True
        if value['input'].get('auto_advance') is True:
            # Persist validated outputs against the latest project version. Only
            # internal, reversible plan adoption is automated; unresolved evidence,
            # unscheduled work or external dependencies remain behind the approval gate.
            current = team.state(value['input']['project_id'])
            current = team.diagnosis({
                'project_id': current['project_id'],
                'expected_version': current['version'],
                'diagnosis': value['diagnosis'],
            })
            current = team.propose({
                'project_id': current['project_id'],
                'expected_version': current['version'],
                'plan': value['plan'],
                'reason': '事件触发的自动工作流：诊断与计划已通过结构校验',
            })
            blockers = []
            if current['diagnosis'].get('unknowns'):
                blockers.append('诊断仍有未知项')
            if current['proposal']['plan'].get('unscheduled'):
                blockers.append('仍有未排入计划的任务')
            if any(t.get('status') == 'blocked' or t.get('external_dependencies')
                   for t in current['proposal']['plan'].get('tasks', [])):
                blockers.append('存在阻塞任务或外部依赖')
            if blockers:
                result.update({
                    'preview_only': True,
                    'auto_adopted': False,
                    'approval_required': True,
                    'approval_reasons': blockers,
                    'proposal_id': current['proposal']['id'],
                    'expected_version': current['version'],
                })
                store.event(run['id'], 'approval_gate', 'waiting', {'reasons': blockers})
                store.finish(run['id'], run['lease_token'], 'awaiting_confirmation', result)
                return
            adopted = team.apply_automated({
                'project_id': current['project_id'],
                'expected_version': current['version'],
                'proposal_id': current['proposal']['id'],
            })
            result.update({
                'preview_only': False,
                'auto_adopted': True,
                'approval_required': False,
                'adopted_plan_version': adopted['plan']['plan_version'],
                'expected_version': adopted['version'],
            })
            store.event(run['id'], 'auto_adoption', 'completed', {
                'plan_version': adopted['plan']['plan_version'],
                'project_version': adopted['version'],
            })
            store.finish(run['id'], run['lease_token'], 'succeeded', result)
            return
        store.finish(run['id'], run['lease_token'], 'awaiting_confirmation', result)
    except Exception as exc:
        code = getattr(exc, 'code', type(exc).__name__)
        store.event(run['id'], 'workflow', 'failed', {'error_code':code})
        store.finish(run['id'], run['lease_token'], 'failed', error=code)
    finally:
        stopped.set(); thread.join(timeout=1)


def worker(once=False):
    import os
    if os.getenv('SHANGAN_USE_HERMES') == '1':
        from hermes_gateway import connect_local_gateway
        if not connect_local_gateway():
            raise RuntimeError('HERMES_CONNECTION_FAILED')
    store.init()
    universal_autoloop.init()
    next_deadline_scan = 0.0
    next_inbox_scan = 0.0
    while True:
        now = time.monotonic()
        if now >= next_deadline_scan:
            try:
                autoloop_signals.enqueue_due_deadlines()
            except Exception:
                logging.exception('Autoloop deadline scan failed; worker will continue')
            next_deadline_scan = now + 60.0
        if now >= next_inbox_scan:
            try:
                universal_autoloop.dispatch_pending()
            except Exception:
                logging.exception("Autoloop inbox dispatch failed; worker will continue")
            next_inbox_scan = now + 5.0
        run = store.claim()
        if run:
            execute(run)
        elif once:
            break
        else:
            time.sleep(1)


if __name__ == '__main__':
    worker()
