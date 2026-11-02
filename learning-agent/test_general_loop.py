"""Real bytes/SQLite/HTTP, explicitly controlled model replies; not quality scores."""
import base64
import copy
import io
import json
import tempfile
import threading
import unittest
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
import learning_agent as agent
import artifact_store as store
import personal_guidance as guidance
import team_inputs as inputs
import team_ai as ai
import team_orchestrator as team
import team_handoff as handoff
import team_revision as revision
import team_dispatch as dispatch


def diagnosis_reply(p, skills=None):
    r = next(x for x in p['stored_artifacts'] if x['purpose'] == 'input')
    ref = {'artifact_id':r['artifact_id'],'artifact_version':r['artifact_version']}
    unit = store.read(p, ref['artifact_id'], ref['artifact_version'])['units'][0]
    return {'gaps':[{'gap_id':'G1','current_evidence':'人工夹具：当前人数没有写明有效分母',
        'target_result':'在人数旁写明有效分母与缺失口径','gap_type':'artifact',
        'priority_reason':'人工判据要求可复查分母','related_member_ids':[p['member_task_briefs'][0]['member_id']],
        'required_capabilities':skills or [],'source_refs':['material:'+ref['artifact_id']+':'+str(ref['artifact_version'])],
        'acceptance_criteria':['写明有效分母和缺失人数'],'current_artifact':ref,
        'current_locator':unit['locator'],'reason':'人数必须能回到原始记录','extract_pattern':'提取可复查分母与缺失口径的证据结构，不复制外部作品内容',
        'evidence_refs':[{**ref,'locator':unit['locator'],'quote':unit['text']}],
        'micro_steps':[{'step_id':'s1','input_version':ref,'target_locator':unit['locator'],
            'action':'核对这行人数，在人数旁追加有效分母与缺失记录数','reason':'避免把缺失计为0',
            'expected_change':'写清两项数字和口径','output':'带有效分母的新版报告',
            'self_check':'回到原数据核对分母与缺失数之和','failure_next':'若对不上，保存当前行及计数方法',
            'capability_basis':'人工控制夹具；不是模型能力结论'}]}],
        'unknowns':['官方比赛规则尚未确认'],'understanding_checks':['本人需核对分母口径']}


class GeneralLoopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = patch.object(agent, 'DB', self.tmp.name+'/team.sqlite3')
        self.db.start()
        self.p = team.create({'goal':'人工控制案例：修正人数口径','mode':'live'})
    def tearDown(self):
        self.db.stop()
        self.tmp.cleanup()
    def ctx(self):
        return {'project_id':self.p['project_id'],'expected_version':self.p['version']}
    def upload(self, text='人数=3；有效分母未知', identifier='report', purpose='input', filename='report.txt'):
        raw = text.encode('utf-8') if isinstance(text,str) else text
        self.p = store.import_file({**self.ctx(),'filename':filename,'data_base64':base64.b64encode(raw).decode(),
                                   'artifact_id':identifier,'kind':'user_material','purpose':purpose})
    def setup_inputs(self, kind='competition'):
        self.p = inputs.save_context({**self.ctx(),'project_context':{'project_type':kind,'event_name':'人工测试项目',
            'target_result':'可复查的报告','acceptance_criteria':['写明有效分母和缺失人数'],'deadline':''}})
        self.p = inputs.save_member({**self.ctx(),'member':{'member_id':'member-a','name':'成员甲',
            'owned_task':'核对人数口径','understanding':'缺失不是0，分母要能回查','tools':'文本编辑器',
            'self_reported_capabilities':['数据清洗']}})
        self.p = inputs.save_member({**self.ctx(),'member':{'member_id':'member-reviewer','name':'独立复核角色',
            'owned_task':'复核他人成果','understanding':'仅工程夹具，不代表真人复核',
            'tools':'文本编辑器','self_reported_capabilities':[]}})
        self.upload()
    def model_context(self, value):
        return patch.multiple(ai.rescue, public_config=lambda:{'configured':True},
            config_snapshot=lambda:{'model':'controlled-fixture'}, complete=lambda *args:json.dumps(value,ensure_ascii=False))
    def diagnose(self, skills=None):
        with self.model_context(diagnosis_reply(self.p,skills)):
            d = ai.researcher(self.p)
        self.p = team.diagnosis({**self.ctx(),'diagnosis':d})
    def plan(self):
        self.p = handoff.generate(self.ctx())
        self.p = team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
    def event(self, action, tid='G1:deliver', **extra):
        self.p = team.feedback({**self.ctx(),'expected_plan_version':self.p['plan']['plan_version'],
                               'task_id':tid,'action':action,'note':'人工控制验收记录',**extra})
    def submitted(self):
        self.setup_inputs(); self.diagnose(); self.plan(); self.event('start')
        self.upload('有效分母=2；缺失人数=1',purpose='submission')
        self.assertFalse(self.p['plan_stale'])
        self.event('submit',artifact_id='report',artifact_version=2,actual_minutes=8,evidence='新版line:1')
    def packet(self, status='closed'):
        ref = {'artifact_id':'report','artifact_version':2,'locator':'line:1','quote':'有效分母=2'}
        steps = copy.deepcopy(self.p['diagnosis']['gaps'][0]['micro_steps'])
        steps[0]['input_version'] = {'artifact_id':'report','artifact_version':2}
        steps[0]['action'] = '在新版有效分母旁解释剩余口径'
        return {'review_id':'controlled-review','task_id':'G1:deliver','reviewer_id':'member-reviewer',
            'plan_version':self.p['plan']['plan_version'],'diagnosis_version':self.p['diagnosis']['diagnosis_version'],
            'artifact_id':'report','artifact_version':2,'method':'manual','note':'人工控制复核',
            'criterion_results':[{'criterion':'写明有效分母和缺失人数','passed':True,'evidence':'两项已写明','evidence_refs':[ref]}],
            'gap_results':[{'gap_id':'G1','status':status,'evidence':'已读新版','remaining_issue':'剩余口径需解释','evidence_refs':[ref], 'remaining_micro_steps':steps}]}
    def confirmed(self, status='closed'):
        self.submitted()
        self.p = handoff.receive_review({**self.ctx(),'review':self.packet(status)})
        self.event('approve',reviewer_id='member-reviewer',criterion_results=[{'criterion':'写明有效分母和缺失人数',
            'passed':True,'evidence':'人工检查新版line:1有效分母2、缺失1'}])
    def capability(self, passed=True):
        self.p = inputs.record_capability({**self.ctx(),'member_id':'member-a','capability':{'name':'数据清洗',
            'criterion':'说明缺失与0的区别','evidence':'本人对照实际产物确认','passed':passed,
            'artifact_id':'report','artifact_version':1,'locator':'line:1','quote':'人数=3'}})

    def test_evidence_context_has_a_hard_total_budget(self):
        evidence = agent.Evidence('context-budget-test')
        evidence.rows = [
            {'id':'S'+str(i),'title':'source '+str(i),'url':'https://example.com/'+str(i),
             'snippet':'snippet','text':'x'*5000,'kind':'search','readStatus':'fulltext'}
            for i in range(1,21)
        ]
        context = evidence.context(max_chars=1200,max_sources=5,per_source=1000)
        self.assertLessEqual(sum(len(row['text']) for row in context),1200)
        self.assertLessEqual(len(context),5)
        self.assertEqual(context[0]['id'],'S1')
        self.assertEqual(evidence.rows[0]['text'], 'x'*5000)  # Prompt clipping must not mutate stored evidence.

    def test_immutable_versions_project_isolation_and_actual_reread(self):
        self.upload(); self.upload('新版人数=2',purpose='submission')
        one = store.read(self.p,'report',1); two = store.read(self.p,'report',2)
        self.assertNotEqual(one['sha256'],two['sha256'])
        with team.connection() as c:
            c.execute("UPDATE team_artifacts SET parsed='{}' WHERE artifact_id='report'")
        self.assertEqual(store.read(self.p,'report',1)['units'],one['units'])
        other = team.create({'goal':'另一项目','mode':'live'})
        with self.assertRaises(ValueError): store.read(other,'report',1)
        with team.connection() as c:
            c.execute("UPDATE team_artifacts SET data=? WHERE artifact_id='report' AND version=1",(b'tampered',))
        with self.assertRaisesRegex(ValueError,'校验'): store.read(self.p,'report',1)
    def test_import_conflict_does_not_save_or_overwrite(self):
        ctx = self.ctx(); self.upload()
        with self.assertRaises(team.Conflict):store.import_file({**ctx,'filename':'x.txt','data_base64':'eA=='})
        with team.connection() as c:
            self.assertEqual(c.execute('SELECT count(*) FROM team_artifacts').fetchone()[0],1)
    def test_invalid_file_path_empty_binary_and_limits(self):
        for name, raw in [('../secret.txt',b'x'),('empty.txt',b''),('binary.txt',b'\x00'),('scan.png',b'x'),('x.txt',b'x'*(store.MAX_BYTES+1))]:
            with self.subTest(name=name),self.assertRaises(ValueError):
                store.import_file({**self.ctx(),'filename':name,'data_base64':base64.b64encode(raw).decode()})
        self.assertEqual(self.p['version'],1)
    def test_csv_logical_rows_keep_multiline_fields(self):
        result=store.parse('rows.csv', 'id,remark\n1,"first\nsecond"\n2,\n'.encode())
        self.assertEqual(result['statistics'],{'logical_rows':3,'columns':2})
        self.assertEqual(result['units'][1]['locator'],'row:2')
        self.assertIn('first\\nsecond',result['units'][1]['text'])
    def test_docx_paragraph_and_table_locators(self):
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w') as z:
            z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
            z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
            z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>实际段落</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格事实</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
        result=store.parse('report.docx',raw.getvalue())
        self.assertEqual([u['locator'] for u in result['units']],['paragraph:1','table:1/row:1/cell:1'])
    def test_pptx_slide_order_uses_relationships(self):
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w') as z:
            z.writestr('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>')
            z.writestr('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>')
            for n in (1,2):z.writestr(f'ppt/slides/slide{n}.xml',f'<slide xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>正文{n}</a:t></a:r></a:p></slide>')
        result=store.parse('slides.pptx',raw.getvalue())
        self.assertEqual(result['units'][0],{'locator':'slide:1/paragraph:1','text':'正文2'})
    def test_exact_quote_position_and_submission_version(self):
        self.upload();self.upload('新版',purpose='submission')
        ref={'artifact_id':'report','artifact_version':1,'locator':'line:1','quote':'人数=3'}
        store.references(self.p,[ref])
        for changes in ({'locator':'line:9'},{'quote':'不存在'},{'artifact_version':99}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):store.references(self.p,[{**ref,**changes}])
        with self.assertRaisesRegex(ValueError,'新版'):store.references(self.p,[ref],('report',2))
    def test_unknown_trial_failed_specific_course_verified_production(self):
        self.setup_inputs();self.diagnose(['数据清洗']);self.plan()
        self.assertEqual([t['kind'] for t in self.p['plan']['tasks']],['trial','production'])
        self.capability(False);self.diagnose(['数据清洗']);self.plan()
        tasks=self.p['plan']['tasks'];self.assertEqual([t['kind'] for t in tasks],['learn','practice','retest','production'])
        self.assertIn('莫烦',tasks[0]['steps'][0]);self.assertIn('NaN',tasks[0]['steps'][0]);self.assertTrue(tasks[0]['micro_steps'])
        self.capability(True);self.diagnose(['数据清洗']);self.plan()
        self.assertEqual([t['kind'] for t in self.p['plan']['tasks']],['production'])
        self.event('start')
    def test_capability_needs_real_quote_and_boolean(self):
        self.setup_inputs()
        data={'name':'数据清洗','criterion':'判据','evidence':'证据','passed':True,'artifact_id':'report','artifact_version':1,'locator':'line:1','quote':'杜撰'}
        for changes in ({},{'passed':'true'},{'quote':'人数=3','artifact_version':99}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):inputs.record_capability({**self.ctx(),'member_id':'member-a','capability':{**data,**changes}})
        self.assertEqual(self.p['member_task_briefs'][0]['capability_evidence'],[])
    def test_forged_skill_in_manual_diagnosis_does_not_pass(self):
        self.setup_inputs();self.diagnose(['数据清洗'])
        d=copy.deepcopy(self.p['diagnosis']);d['diagnosis_version']+=1
        d['member_profiles'][0]['capability_evidence']=[{'capability':'数据清洗','passed':True,'evidence_confirmed':True}]
        self.p=team.diagnosis({**self.ctx(),'diagnosis':d});self.plan()
        self.assertEqual(self.p['plan']['tasks'][0]['kind'],'trial')
        value=diagnosis_reply(self.p,['数据清洗']);value['gaps'][0]['micro_steps'][0]['capability_basis']=['已经精通，直接跳过试做']
        with self.model_context(value):result=ai.researcher(self.p)
        basis=result['gaps'][0]['micro_steps'][0]['capability_basis']
        self.assertIn('未知',basis);self.assertNotIn('精通',basis)
        self.assertEqual(result['gaps'][0]['micro_steps'][0]['capability_basis_source'],'server_member_records')
    def test_diagnosis_cannot_fake_closed_or_history_only(self):
        self.setup_inputs();self.diagnose()
        for flag in ({'status':'closed','confirmed_review_id':'fake'},{'history_only':True}):
            d=copy.deepcopy(self.p['diagnosis']);d['diagnosis_version']+=1;d['gaps'][0].update(flag)
            with self.subTest(flag=flag),self.assertRaises(ValueError):team.diagnosis({**self.ctx(),'diagnosis':d})
        value=diagnosis_reply(self.p);value['gaps'][0].update(status='closed',history_only=True)
        with self.model_context(value):d=ai.researcher(self.p)
        self.assertEqual(d['gaps'][0]['status'],'open');self.assertNotIn('history_only',d['gaps'][0])
    def test_manual_diagnosis_cannot_reference_fake_step_file(self):
        self.setup_inputs();self.diagnose()
        d=copy.deepcopy(self.p['diagnosis']);d['diagnosis_version']+=1
        fake={'artifact_id':'fake','artifact_version':1}
        d['artifact_versions'].append({**fake,'title':'未上传'})
        d['gaps'][0]['micro_steps'][0]['input_version']=fake
        with self.assertRaises(ValueError):team.diagnosis({**self.ctx(),'diagnosis':d})
    def test_fake_submission_and_premature_production_are_blocked(self):
        self.setup_inputs();self.diagnose(['数据清洗']);self.plan()
        with self.assertRaisesRegex(ValueError,'前置'):self.event('start')
        trial=self.p['plan']['tasks'][0]['task_id'];self.event('start',trial)
        with self.assertRaises(ValueError):self.event('submit',trial,artifact_id='fake',artifact_version=1,actual_minutes=3,evidence='口头说明')
        self.event('submit',trial,artifact_id='report',artifact_version=1,actual_minutes=3,evidence='实际记录')
        t=self.p['plan']['tasks'][0];self.event('approve',trial,reviewer_id='member-reviewer',criterion_results=[{'criterion':t['acceptance_criteria'][0],'passed':True,'evidence':'试做记录已提交'}])
        with self.assertRaisesRegex(ValueError,'能力'):self.event('start')
    def test_confirmed_closure_preserves_history_and_only_remaining(self):
        self.confirmed();old=copy.deepcopy(self.p['plan']['tasks'][0]);old_version=self.p['version']
        self.p=revision.advance({**self.ctx(),'review_id':'controlled-review'})
        self.assertTrue(self.p['plan_stale']);self.assertEqual(self.p['proposal']['plan']['tasks'],[old])
        self.assertEqual(self.p['diagnosis']['gaps'][0]['status'],'closed')
        again=revision.advance({**self.ctx(),'review_id':'controlled-review'});self.assertEqual(again['version'],self.p['version'])
        self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
        restored=team.state(self.p['project_id']);self.assertEqual(restored['plan']['tasks'][0],old)
        self.assertEqual(restored['dispatch_status']['stage'],'done');self.assertGreater(len(restored['history']),old_version)
        self.assertFalse(restored['live_verified'])
    def test_receive_without_human_approval_cannot_close(self):
        self.submitted();self.p=handoff.receive_review({**self.ctx(),'review':self.packet()})
        with self.assertRaisesRegex(ValueError,'人工|逐条件'):revision.advance({**self.ctx(),'review_id':'controlled-review'})
        self.assertNotEqual(self.p['diagnosis']['gaps'][0].get('status'),'closed')
        self.assertFalse(self.p['artifact_reviews'][0]['content_independently_verified'])
        self.assertFalse(self.p['artifact_reviews'][0]['content_read_verified'])
    def test_remaining_creates_revision_without_reopening_completed(self):
        self.confirmed('remaining');old=copy.deepcopy(self.p['plan']['tasks'][0])
        self.p=revision.advance({**self.ctx(),'review_id':'controlled-review'})
        tasks=self.p['proposal']['plan']['tasks'];self.assertEqual(tasks[0],old)
        self.assertEqual(tasks[1]['task_id'],'G1:deliver:revision:2');self.assertEqual(tasks[1]['status'],'candidate')
    def test_unknown_review_requires_manual_resolution(self):
        self.confirmed('unknown');self.p=revision.advance({**self.ctx(),'review_id':'controlled-review'})
        self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
        with self.assertRaisesRegex(ValueError,'外部'):self.event('start','G1:deliver:revision:2')
    def test_stale_review_and_client_read_claim_rejected(self):
        self.submitted();packet=self.packet();packet['artifact_version']=1
        with self.assertRaises(team.Conflict):handoff.receive_review({**self.ctx(),'review':packet})
        packet=self.packet();packet['criterion_results'][0]['evidence_refs'][0]['quote']='不存在';packet['content_read_verified']=True
        with self.assertRaises(ValueError):handoff.receive_review({**self.ctx(),'review':packet})
    def test_A_goal_handoff_before_diagnosis_contains_actual_project_inputs(self):
        self.setup_inputs()
        self.p = dispatch.brief({**self.ctx(),'content':'A已收集资料，本轮只核对有效分母'})
        other = team.create({'goal':'另一个项目，不应泄漏','mode':'live'})
        store.import_file({'project_id':other['project_id'],'expected_version':other['version'],
            'artifact_id':'report','filename':'report.txt','kind':'user_material','purpose':'input',
            'data_base64':base64.b64encode('另一个项目的材料'.encode()).decode()})
        packet = handoff.review_request(self.p, include_documents=True)
        self.assertIsNone(packet['diagnosis'])
        self.assertEqual(packet['response_context'],self.ctx())
        self.assertEqual(packet['project_context']['target_result'],'可复查的报告')
        self.assertEqual(packet['member_task_briefs'][0]['owned_task'],'核对人数口径')
        self.assertEqual(packet['brief_history'][-1]['content'],'A已收集资料，本轮只核对有效分母')
        self.assertEqual(packet['documents'][0]['units'][0]['text'],'人数=3；有效分母未知')
        self.assertTrue(packet['document_bytes_checked'])
        self.assertNotIn('另一个项目的材料',json.dumps(packet,ensure_ascii=False))
        packet['member_task_briefs'][0]['owned_task']='不得修改原记录'
        self.assertEqual(team.state(self.p['project_id'])['member_task_briefs'][0]['owned_task'],'核对人数口径')
    def test_A_handoff_after_goal_change_keeps_versions_and_blocks_old_review(self):
        self.submitted()
        old_context=self.ctx(); old_review=self.packet(); old_plan=copy.deepcopy(self.p['plan'])
        self.p=inputs.save_context({**self.ctx(),'project_context':{'project_type':'research',
            'target_result':'新增逐行复算依据','acceptance_criteria':['每行可复算'],'deadline':''}})
        packet=handoff.review_request(self.p,include_documents=True)
        self.assertEqual(packet['project_context']['target_result'],'新增逐行复算依据')
        self.assertTrue(packet['diagnosis_needs_refresh']);self.assertTrue(packet['plan_stale'])
        self.assertEqual({(d['artifact_id'],d['artifact_version']) for d in packet['documents']},{('report',1),('report',2)})
        self.assertEqual(packet['pending_tasks'][0]['submission']['artifact_version'],2)
        self.assertEqual(self.p['plan'],old_plan)
        with self.assertRaises(team.Conflict):handoff.receive_review({**old_context,'review':old_review})
        with self.assertRaises(team.Conflict):handoff.receive_review({**self.ctx(),'review':old_review})
    def test_A_handoff_over_budget_refuses_without_truncating_or_mutating(self):
        self.setup_inputs(); self.upload('实际正文'*16000,identifier='large',filename='large.txt')
        version=self.p['version']
        with self.assertRaisesRegex(ValueError,'没有静默裁切'):
            handoff.review_request(self.p,include_documents=True)
        self.assertEqual(team.state(self.p['project_id'])['version'],version)
    def test_b_preserves_started_dependencies_and_locked_slots(self):
        self.setup_inputs();self.diagnose(['数据清洗']);self.plan()
        self.event('start',self.p['plan']['tasks'][0]['task_id'])
        old=copy.deepcopy(self.p['plan']);old['time_blocks']=[{'task_id':old['tasks'][0]['task_id'],'member_id':'member-a',
            'start':'2026-10-15T09:00:00+08:00','end':'2026-10-15T09:15:00+08:00','locked':True}]
        self.p['plan']=old;self.p=team.commit(self.p,self.p['version'],'人工锁定测试时段')
        self.capability(True);self.diagnose(['数据清洗']);self.p=handoff.generate(self.ctx())
        new=self.p['proposal']['plan'];self.assertEqual(new['tasks'][0],old['tasks'][0]);self.assertEqual(new['time_blocks'],old['time_blocks'])
        self.assertTrue(new['protected_attention'])
    def test_bound_providers_missing_model_never_create_sample(self):
        self.setup_inputs()
        with patch.object(dispatch,'RESEARCHER',ai.researcher),patch.object(dispatch,'PLANNER',handoff.planner),patch.object(ai.rescue,'public_config',return_value={'configured':False}):
            self.p=dispatch.dispatch(self.ctx())
        self.assertEqual(self.p['dispatch']['error_code'],'CONFIG_REQUIRED');self.assertIsNone(self.p['diagnosis'])
        self.assertIsNone(self.p['proposal'])
    def test_new_failed_evidence_creates_new_retest_preserves_completed_learning(self):
        self.setup_inputs();self.capability(False);self.diagnose(['数据清洗']);self.plan()
        for t in copy.deepcopy(self.p['plan']['tasks'][:3]):
            self.event('start',t['task_id']);self.event('submit',t['task_id'],artifact_id='report',artifact_version=1,actual_minutes=3,evidence='人工试做记录')
            self.event('approve',t['task_id'],reviewer_id='member-reviewer',criterion_results=[{'criterion':t['acceptance_criteria'][0],'passed':True,'evidence':'记录已提交，不代表能力通过'}])
        old=copy.deepcopy(self.p['plan']['tasks'][:3]);self.capability(False);self.diagnose(['数据清洗']);self.p=handoff.generate(self.ctx())
        tasks=self.p['proposal']['plan']['tasks'];self.assertEqual(tasks[:3],old)
        self.assertEqual([t['kind'] for t in tasks[3:]],['learn','practice','retest','production'])
        self.assertTrue(all(t['task_id'].endswith(':revision:2') for t in tasks[3:6]))
        self.assertEqual(tasks[-1]['depends_on'],[tasks[-2]['task_id']])
    def test_omitted_old_gap_remains_unknown_not_silently_closed(self):
        self.setup_inputs();self.diagnose();self.plan();self.event('start')
        value=diagnosis_reply(self.p);value['gaps'][0]['gap_id']='G2'
        with self.model_context(value):d=ai.researcher(self.p)
        kept=next(g for g in d['gaps'] if g['gap_id']=='G1')
        self.assertTrue(kept['manual_hold']);self.assertFalse(kept['history_only'])
        self.assertTrue(any('G1' in x for x in d['unknowns']))
        self.p=team.diagnosis({**self.ctx(),'diagnosis':d});self.p=handoff.generate(self.ctx())
        self.assertEqual(self.p['proposal']['plan']['tasks'][0]['status'],'in_progress')
    def test_invalid_model_quote_bounded_retry_and_durable_trace(self):
        self.setup_inputs();value=diagnosis_reply(self.p);value['gaps'][0]['evidence_refs'][0]['quote']='杜撰事实'
        with patch.object(ai.rescue,'public_config',return_value={'configured':True}),patch.object(ai.rescue,'config_snapshot',return_value={'model':'controlled'}),patch.object(ai.rescue,'complete',return_value=json.dumps(value)) as model:
            with self.assertRaisesRegex(ValueError,'两次'):ai.researcher(self.p)
        self.assertEqual(model.call_count,2)
        retry=json.loads(model.call_args.args[0][-1]['content'])
        self.assertIn('output_instructions',retry);self.assertIn('validation_feedback',retry)
        self.assertEqual(retry['documents'][0]['units'][0]['text'],'人数=3；有效分母未知')
        with team.connection() as c:run=json.loads(c.execute('SELECT body FROM team_ai_runs').fetchone()[0])
        self.assertEqual(run['status'],'failed');self.assertEqual(len(run['attempts']),2);self.assertEqual(run['input']['project_context']['deadline'],'')
    def test_structured_understanding_annotation_preserves_content_without_confirming(self):
        self.setup_inputs();value=diagnosis_reply(self.p)
        row={'check_id':'1','target_locator':'line:1','expected_output':'能回查原文','rationale':'核对本人理解','passed':True}
        value['understanding_checks']=[row]
        with self.model_context(value):d=ai.researcher(self.p)
        self.assertEqual(json.loads(d['understanding_checks'][0]),row)
        self.assertTrue(d['understanding_confirmation_required'])
        self.assertEqual(d['gaps'][0]['status'],'open')
    def test_reviewer_reads_actual_newer_bytes_and_remaining_actions(self):
        self.submitted();value=self.packet('remaining');s=copy.deepcopy(self.p['diagnosis']['gaps'][0]['micro_steps'])
        s[0]['input_version']={'artifact_id':'report','artifact_version':2};s[0]['action']='在新版人数后追加口径说明'
        value['gap_results'][0]['remaining_micro_steps']=s
        with self.model_context(value),patch.object(dispatch,'REVIEWER',ai.reviewer):self.p=handoff.invoke_review({**self.ctx(),'task_id':'G1:deliver'})
        record=self.p['artifact_reviews'][0];self.assertTrue(record['content_read_verified']);self.assertFalse(record['content_independently_verified'])
        self.assertEqual(record['packet']['read_sha256'],store.read(self.p,'report',2)['sha256'])
    def test_review_also_reads_underlying_data_and_has_bound_contract(self):
        self.setup_inputs();self.upload('id,value\na,2\nb,\n',identifier='data',filename='data.csv')
        self.upload('缺失不计入分母',identifier='criteria',filename='criteria.txt')
        self.diagnose();self.plan();self.event('start');self.upload('有效分母=2；缺失人数=1',purpose='submission')
        self.event('submit',artifact_id='report',artifact_version=2,actual_minutes=5,evidence='实际新版')
        with patch.object(ai.rescue,'public_config',return_value={'configured':True}),patch.object(ai.rescue,'config_snapshot',return_value={'model':'controlled'}),patch.object(ai.rescue,'complete',return_value=json.dumps(self.packet())) as model:
            ai.reviewer(self.p,handoff.review_request(self.p,'G1:deliver'))
        payload=json.loads(model.call_args.args[0][1]['content'])
        self.assertEqual({d['artifact_id'] for d in payload['original_documents']},{'report','data','criteria'})
        self.assertEqual(payload['output_contract']['required_criteria'],['写明有效分母和缺失人数'])
        self.assertNotIn('原条件文字',json.dumps(payload['output_contract'],ensure_ascii=False))
    def test_trial_review_scopes_to_task_evidence_and_workflow_keeps_gap_open(self):
        self.setup_inputs();self.diagnose(['数据清洗']);self.plan()
        task=self.p['plan']['tasks'][0];self.event('start',task['task_id'])
        self.upload('试做：实际副本、判据与未通过记录',identifier='trial',purpose='submission')
        self.event('submit',task['task_id'],artifact_id='trial',artifact_version=1,actual_minutes=5,evidence='实际试做')
        ref={'artifact_id':'trial','artifact_version':1,'locator':'line:1','quote':'试做：实际副本、判据与未通过记录'}
        value={'note':'人工控制夹具：记录完整，不代表能力通过',
            'criterion_results':[{'criterion':task['acceptance_criteria'][0],'passed':True,'evidence':'有实际记录','evidence_refs':[ref]}]}
        with patch.object(ai.rescue,'public_config',return_value={'configured':True}),patch.object(ai.rescue,'config_snapshot',return_value={'model':'controlled'}),patch.object(ai.rescue,'complete',return_value=json.dumps(value)) as model:
            result=ai.reviewer(self.p,handoff.review_request(self.p,task['task_id']))
        payload=json.loads(model.call_args.args[0][1]['content'])
        self.assertEqual(payload['output_contract']['root_fields'],['note','criterion_results'])
        self.assertEqual(result['review_scope'],'task_evidence_only')
        self.assertEqual(result['gap_results'][0]['result_source'],'workflow_gate')
        self.assertEqual(result['gap_results'][0]['status'],'remaining')
        self.assertEqual(result['gap_results'][0]['evidence_refs'],[ref])
        self.assertEqual(self.p['diagnosis']['gaps'][0]['status'],'open')
    def test_four_project_contexts_reach_model_without_fixed_contest(self):
        for kind in ('competition','hackathon','business','research'):
            self.p=team.create({'goal':'类别'+kind,'mode':'live'});self.setup_inputs(kind)
            value=diagnosis_reply(self.p)
            value['gaps'][0]['deadline']='2099-01-01'
            with patch.object(ai.rescue,'public_config',return_value={'configured':True}),patch.object(ai.rescue,'config_snapshot',return_value={'model':'controlled'}),patch.object(ai.rescue,'complete',return_value=json.dumps(value)) as model:
                d=ai.researcher(self.p)
            payload=json.loads(model.call_args.args[0][1]['content'])
            self.assertEqual(payload['project_context']['project_type'],kind);self.assertEqual(payload['project_context']['deadline'],'')
            self.assertEqual(d['gaps'][0]['deadline'],'待成员确认')


class GeneralHTTPTests(unittest.TestCase):
    setUp=GeneralLoopTests.setUp
    tearDown=GeneralLoopTests.tearDown
    ctx=GeneralLoopTests.ctx
    upload=GeneralLoopTests.upload
    setup_inputs=GeneralLoopTests.setup_inputs
    def test_http_real_upload_quote_and_configured_model_transport(self):
        from learning_agent_server import Handler
        self.setup_inputs();value=diagnosis_reply(self.p);seen=[]
        class Model(BaseHTTPRequestHandler):
            def do_POST(inner):
                body=json.loads(inner.rfile.read(int(inner.headers['Content-Length'])))
                seen.append(json.loads(body['messages'][1]['content']))
                raw=json.dumps({'choices':[{'message':{'content':json.dumps(value,ensure_ascii=False)}}]}).encode()
                inner.send_response(200);inner.send_header('Content-Type','application/json');inner.send_header('Content-Length',str(len(raw)));inner.end_headers();inner.wfile.write(raw)
            def log_message(*args):pass
        model=ThreadingHTTPServer(('127.0.0.1',0),Model);server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        for service in (model,server):threading.Thread(target=service.serve_forever,daemon=True).start()
        base='http://127.0.0.1:'+str(server.server_port)
        def post(op,data):
            request=Request(base+'/api/agent/team/'+op,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
            with urlopen(request,timeout=5) as r:return json.load(r)
        cfg={'base':'http://127.0.0.1:'+str(model.server_port)+'/v1','model':'controlled-http-fixture','key':'','protocol':'chat','verified':False}
        try:
            with urlopen(base+'/api/agent/team/handoff?id='+self.p['project_id']) as r:
                packet=json.load(r)
            self.assertEqual(packet['response_context'],self.ctx())
            self.assertEqual(packet['documents'][0]['units'][0]['text'],'人数=3；有效分母未知')
            with patch.object(ai.rescue,'CONFIG',cfg),patch.object(dispatch,'RESEARCHER',ai.researcher),patch.object(dispatch,'PLANNER',handoff.planner):
                self.p=post('dispatch',self.ctx())
            self.assertEqual(self.p['dispatch']['status'],'succeeded');self.assertEqual(len(seen),1)
            self.assertEqual(seen[0]['documents'][0]['units'][0]['text'],'人数=3；有效分母未知')
            with urlopen(base+'/api/agent/team/artifact?id='+self.p['project_id']+'&artifact_id=report&artifact_version=1') as r:
                self.assertEqual(json.load(r)['units'][0]['locator'],'line:1')
            with self.assertRaises(HTTPError) as error:post('artifact-import',{**self.ctx(),'filename':'../x.txt','data_base64':'eA=='})
            self.assertEqual(error.exception.code,400)
        finally:
            for service in (model,server):service.shutdown();service.server_close()


if __name__=='__main__':unittest.main()
