"""Runnable SIMULATED integration harness over existing captain modules.
Actual bytes, SQLite and B rules; controlled model and scripted role events.
"""
import argparse
import copy
import difflib
import hashlib
import html
import json
import os
from pathlib import Path
import tempfile
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root', type=Path, default=Path(__file__).parent / 'demo-runs')
    out = parser.parse_args().output_root.resolve() / ('run-' + uuid.uuid4().hex[:12])
    out.mkdir(parents=True, exist_ok=False)
    os.environ['SHANGAN_AGENT_DATA'] = str(out / 'bootstrap')
    # Keep fixture databases in this new run, including on Windows sandboxes.
    tempfile.tempdir = str(out)
    import learning_agent as agent
    import team_orchestrator as team
    import team_handoff as handoff
    import team_revision as revision
    from test_captain_review_gates import CaptainReviewGateTests
    case = CaptainReviewGateTests()
    case.setUp()
    trace = []

    def record(label, detail=None):
        trace.append({'label': label, 'version': case.p['version'], 'detail': detail,
            'task_status': (case.p.get('plan') or {}).get('tasks', [{}])[0].get('status')})

    def reject(label, operation, error=ValueError):
        before = team.state(case.p['project_id'])
        try:
            operation()
        except error as exc:
            assert before == team.state(case.p['project_id'])
            record(label, str(exc))
        else:
            raise AssertionError('Expected rejection: ' + label)

    try:
        case.setup_inputs()
        record('Import actual V1 bytes')
        case.diagnose()
        record('A controlled response; actual quote validation')
        case.plan()
        record('B rules -> C adopt plan')
        stale = case.ctx()
        case.event('start')
        record('Start -> in_progress')
        reject('Reject stale expected_version', lambda: team.feedback({**stale,
            'task_id': 'G1:deliver', 'expected_plan_version': 1, 'action': 'block', 'note': 'stale'}), team.Conflict)
        reject('Reject missing artifact', lambda: case.event('submit', artifact_id='missing',
            artifact_version=2, actual_minutes=0, evidence='missing'))
        case.upload('有效分母=2；缺失人数=1', purpose='submission')
        case.event('submit', artifact_id='report', artifact_version=2, actual_minutes=0,
                   evidence='SIMULATED generated V2 line:1; no human execution')
        assert case.p['plan']['tasks'][0]['status'] == 'pending_review'
        record('Submit V2 -> pending_review')
        reject('Reject approval without A receipt', case.approve)
        packet = case.packet()
        bad = copy.deepcopy(packet)
        bad['criterion_results'][0]['evidence_refs'][0]['artifact_version'] = 1
        reject('Reject stale review evidence', lambda: handoff.receive_review({**case.ctx(), 'review': bad}))
        case.p = handoff.receive_review({**case.ctx(), 'review': packet})
        version = case.p['version']
        case.p = handoff.receive_review({**case.ctx(), 'review': packet})
        assert case.p['version'] == version
        assert case.p['plan']['tasks'][0]['status'] == 'pending_review'
        record('Duplicate receipt is idempotent; still pending_review')
        case.approve()
        record('Scripted confirmation -> completed; engineering only')
        done = copy.deepcopy(case.p['plan']['tasks'][0])
        draft = copy.deepcopy(case.p['plan'])
        draft['plan_version'] += 1
        draft['tasks'][0]['steps'] = ['overwrite']
        reject('Reject completed task overwrite', lambda: team.propose({**case.ctx(), 'plan': draft, 'reason': 'negative case'}))
        case.p = revision.advance({**case.ctx(), 'review_id': packet['review_id']})
        case.p = team.apply({**case.ctx(), 'proposal_id': case.p['proposal']['id']})
        assert case.p['plan']['tasks'][0] == done
        record('Remaining replan preserves completed task')
        restored = team.state(case.p['project_id'])
        assert restored['plan']['tasks'][0] == done and not restored['live_verified']
        record('New SQLite connection restores state; live_verified=false')
        import artifact_store
        texts = []
        for v in (1, 2):
            doc = artifact_store.read(case.p, 'report', v)
            text = '\n'.join(u['text'] for u in doc['units']) + '\n'
            texts.append(text)
            (out / ('V' + str(v) + '.txt')).write_text(text, encoding='utf-8')
        (out / 'V1-V2.diff').write_text(''.join(difflib.unified_diff(texts[0].splitlines(True),
            texts[1].splitlines(True), fromfile='V1.txt', tofile='V2.txt')), encoding='utf-8')
        # SQLite backup API preserves a readable DB without copying open WAL files.
        import sqlite3
        with agent.connection() as source, sqlite3.connect(out / 'demo.sqlite3') as target:
            source.backup(target)
        root = Path(__file__).resolve().parent
        hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.glob('*.py'))}
        result = {'mode': 'SIMULATED', 'upstream_commit': '00935fcb356a977a55db2ad6374b0219f26495b8',
            'source_sha256': hashes, 'trace': trace, 'project': restored,
            'claims': {'engineering': 'pass', 'live_model': 'not_run', 'human_V2': 'not_run',
                'independent_human_review': 'not_run', 'user_effect': 'not_run'}}
        (out / 'trace.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        cards = ''.join('<details><summary>' + html.escape(t['label']) + '</summary><pre>' +
            html.escape(json.dumps(t, ensure_ascii=False, indent=2)) + '</pre></details>' for t in trace)
        (out / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>C 工程证据 demo</title>'
            '<style>body{max-width:900px;margin:40px auto;font:17px system-ui;background:#f4f7fa;color:#142837}'
            'details{padding:14px;background:white;border-bottom:1px solid #ccd}pre{white-space:pre-wrap}'
            'aside{padding:20px;background:#fff0c2}</style><h1>C：版本与成果验收闭环</h1>'
            '<aside>SIMULATED：复用仓库测试夹具。真实字节、SQLite、B规则与状态机；模型与角色事件为脚本。'
            '未完成真实模型、真人V2或独立内容复核。runtime mode=live仅启用实际材料门，live_verified=false。'
            '同一脚本生成并确认结果，不构成人员独立性证明。</aside><p>点击每一步查看状态和拒绝原因。</p>' + cards +
            '<p><a href="trace.json">完整轨迹</a> · <a href="V1.txt">V1</a> · <a href="V2.txt">V2</a> · '
            '<a href="V1-V2.diff">差异</a></p>', encoding='utf-8')
        print(json.dumps({'result': 'pass', 'mode': 'SIMULATED', 'output': str(out), 'events': len(trace)}, ensure_ascii=False))
    finally:
        case.tearDown()


if __name__ == '__main__':
    main()
