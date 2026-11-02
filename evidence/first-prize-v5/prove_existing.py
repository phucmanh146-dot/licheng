"""Reproduce bounded engineering evidence; never claim live AI or user benefit.

Uses pinned repository modules, historical source snapshots, human fixtures and
temporary SQLite databases. No search, model request or production-data write.
"""
import argparse
import ast
import copy
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from html.parser import HTMLParser

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def blob_sha(data):
    # Match Git's canonical text blob on Windows with core.autocrlf=true.
    # The working tree may contain CRLF while the committed blob contains LF.
    data = data.replace(b'\r\n', b'\n')
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


class FormValues(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inputs = {}
        self.goal = ''
        self.in_goal = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input':
            self.inputs[attrs.get('id')] = attrs.get('value', '')
        if tag == 'textarea' and attrs.get('id') == 'goal':
            self.in_goal = True

    def handle_endtag(self, tag):
        if tag == 'textarea':
            self.in_goal = False

    def handle_data(self, data):
        if self.in_goal:
            self.goal += data


def seeds(code):
    for node in ast.parse(code).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'SEEDS' for t in node.targets):
            return ast.literal_eval(node.value)['competition']
    raise AssertionError('SEEDS missing')


def source_audit(provenance):
    for entry in provenance['before_files']:
        assert blob_sha((HERE / entry['snapshot']).read_bytes()) == entry['git_blob_sha'], entry['snapshot']
    for entry in provenance['module_blobs']:
        assert blob_sha((ROOT / entry['path']).read_bytes()) == entry['sha'], 'Source differs from pinned input: ' + entry['path']
    before = (HERE / 'before/learning_agent.py.txt').read_text()
    after = (ROOT / 'learning-agent/learning_agent.py').read_text()
    old_form, new_form = FormValues(), FormValues()
    old_form.feed((HERE / 'before/learning-agent.html.txt').read_text())
    new_form.feed((ROOT / 'learning-agent/learning-agent.html').read_text())
    old_seeds, new_seeds = seeds(before), seeds(after)
    assert old_seeds and not new_seeds
    assert old_form.goal.strip() and not new_form.goal.strip()
    assert old_form.inputs['deadline'] and not new_form.inputs['deadline']
    return {'before_commit': provenance['before_commit'], 'after_runtime_commit': provenance['input_commit'],
            'before_fixed_sources': [{'title': row[0], 'url': row[1]} for row in old_seeds],
            'after_fixed_competition_source_count': len(new_seeds),
            'before_prefilled_goal': old_form.goal.strip(), 'after_prefilled_goal': new_form.goal.strip(),
            'before_prefilled_deadline': old_form.inputs['deadline'], 'after_prefilled_deadline': new_form.inputs['deadline'],
            'pinned_python_files_checked': len(provenance['module_blobs']),
            'meaning': '实际源码修复证明；不证明材料诊断或用户效果'}


def schedule_proof():
    from agent_schedule import schedule
    done = {'id': 'T0', 'title': '已保留的原稿', 'minutes': 10, 'status': 'done', 'dependsOn': [],
            'sessions': [{'date': '2026-10-11', 'minutes': 10}], 'evidence': '模拟历史记录，不能丢失'}
    tasks = [done]
    for identifier, title, minutes, dependency in [
            ('T1', '核对模拟访谈', 20, 'T0'), ('T2', '修改第2.1节', 15, 'T1'),
            ('T3', '补需求与动作表', 15, 'T2'), ('T4', '复核新版与证据', 10, 'T3')]:
        tasks.append({'id': identifier, 'title': title, 'minutes': minutes, 'dependsOn': [dependency], 'status': 'todo'})
    settings = {'startDate': '2026-10-12', 'deadline': '2026-10-13', 'dailyMinutes': 90,
                'dayBudgets': {'2026-10-12': 60, '2026-10-13': 60}}
    base = schedule(copy.deepcopy(tasks), copy.deepcopy(settings))
    disturbed_settings = copy.deepcopy(settings)
    disturbed_settings['dayBudgets']['2026-10-12'] = 30
    disturbed = schedule(copy.deepcopy(tasks), disturbed_settings)
    tight_settings = copy.deepcopy(disturbed_settings)
    tight_settings['deadline'] = '2026-10-12'
    tight = schedule(copy.deepcopy(tasks), tight_settings)
    for result in (base, disturbed, tight):
        assert result['tasks'][0] == done
        assert all(d['used'] <= d['capacity'] for d in result['days'])
        assert all(t['status'] == 'todo' for t in result['tasks'][1:])
    assert base['unscheduledMinutes'] == disturbed['unscheduledMinutes'] == 0
    assert [(d['date'], d['used']) for d in disturbed['days']] == [('2026-10-12', 30), ('2026-10-13', 30)]
    assert tight['unscheduledMinutes'] == 30
    return {'input_nature': 'synthetic', 'execution': 'actual repository schedule function',
            'base': base, 'lost_30_minutes': disturbed, 'same_day_deadline': tight,
            'meaning': '真实代码在指定输入下守容量、保留完成记录、报告缺口；不是模型估时准确性或实际用户效果'}


def data_reference_math():
    rows = list(csv.DictReader((HERE / 'data/input.csv').open(newline='')))
    unique, duplicate, missing, zero = {}, [], [], []
    for lineno, row in enumerate(rows, 2):
        if row['record_id'] in unique:
            assert row == unique[row['record_id']]['row'], 'Conflicting duplicates must be clarified'
            duplicate.append(lineno)
        else:
            unique[row['record_id']] = {'row': row, 'line': lineno}
    collected = returned = 0
    for record in unique.values():
        row = record['row']
        if not row['collected_bottles'] or not row['returned_bottles']:
            missing.append(record['line']); continue
        c, r = int(row['collected_bottles']), int(row['returned_bottles'])
        assert c >= 0 and r >= 0
        if c == 0:
            zero.append(record['line'])
        collected += c; returned += r
    assert (len(rows), len(duplicate), len(missing), len(zero), collected, returned) == (6, 1, 1, 1, 60, 42)
    return {'input_nature': 'synthetic', 'oracle': 'manual reference independently recomputed',
            'rows': len(rows), 'excluded_duplicate_lines': duplicate, 'missing_denominator_lines': missing,
            'zero_denominator_lines': zero, 'collected': collected, 'returned': returned,
            'aggregate_rate': returned / collected, 'meaning': '验证人工期望结果的算术；不证明A/B生成质量'}


def interface_proof():
    names = [
        'test_handoff.HandoffTests.test_empty_A_template_and_missing_criteria_cannot_generate',
        'test_handoff.HandoffTests.test_incremental_A_addition_preserves_completed_task_and_evidence',
        'test_handoff.HandoffTests.test_review_export_exact_submission_and_receive_does_not_complete',
        'test_handoff.HandoffTests.test_review_guards_wrong_versions_members_gap_and_criterion',
        'test_competition_context']
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromNames(names))
    assert result.wasSuccessful() and result.testsRun == 9 and not result.skipped, stream.getvalue()
    from test_handoff import diagnosis_fixture
    from team_handoff import planner
    plan = planner(diagnosis_fixture(), {'goal': '证据复现：人工A包接B规则', 'plan': None})
    return {'tests_run': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
            'fixture_nature': 'human A packets and mocked model/search replies; B is actual delivered code',
            'raw_test_log': stream.getvalue(), 'B_provider': plan['provider'],
            'B_generated_tasks': len(plan['tasks']),
            'B_tasks_with_micro_steps': sum(bool(t.get('micro_steps')) for t in plan['tasks']),
            'live_model_verified': plan['handoff_provenance']['live_model_verified'],
            'meaning': '交接、版本与保护行为的程序证明；精细动作质量和真实A复核仍未证明'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    provenance = json.loads((HERE / 'provenance.json').read_text())
    audit = source_audit(provenance)
    sys.path.insert(0, str(ROOT / 'learning-agent'))
    with tempfile.TemporaryDirectory(prefix='award-evidence-') as data_dir:
        os.environ['SHANGAN_AGENT_DATA'] = data_dir
        report = {'generated_at_utc': datetime.now(timezone.utc).isoformat(),
                  'runtime_input_commit': provenance['input_commit'], 'status': 'engineering_checks_passed',
                  'source_audit': audit, 'capacity_and_progress': schedule_proof(),
                  'reference_arithmetic': data_reference_math(), 'interface_guards': interface_proof(),
                  'live_model_evaluation': 'not_run', 'user_study': 'not_run',
                  'award_readiness': 'not_established',
                  'not_proven': ['A真实诊断和复核', 'B领域精细操作质量', '能力预测准确性', '用户效率提升', '全国一等奖水平']}
    text = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
        print(json.dumps({'saved': str(args.output), 'status': report['status'], 'interface_checks': 9,
                          'tight_deadline_missing_minutes': report['capacity_and_progress']['same_day_deadline']['unscheduledMinutes'],
                          'live_model_evaluation': report['live_model_evaluation']}, ensure_ascii=False))
    else:
        print(text, end='')


if __name__ == '__main__':
    main()
