"""LangGraph research coach: retrieval, diagnosis, domain validation, plan, gate.

Every completed node is checkpointed with a fenced lease. Model outputs remain
candidates: publishing the preview and adopting a plan are explicit user actions.
"""
import copy
import threading
import time
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
import artifact_retrieval
import artifact_store
import platform_store as store
import team_ai
import team_handoff
import team_orchestrator as team


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
        value = build(run['id'], run['lease_token']).invoke({'input':json.loads(run['input'])}, {'recursion_limit':12})
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
    while True:
        run = store.claim()
        if run:
            execute(run)
        elif once:
            break
        else:
            time.sleep(1)


if __name__ == '__main__':
    worker()
