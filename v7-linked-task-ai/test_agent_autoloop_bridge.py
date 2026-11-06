import tempfile
import unittest
from pathlib import Path
import agent_runtime as agent
import autoloop_runtime as autoloop

class AgentAutoloopBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        root=Path(self.tmp.name)
        agent.DB_PATH=root/'agent.sqlite3'
        autoloop.DB_PATH=root/'autoloop.sqlite3'
        self.account='agent-bridge-test'
        agent.config_snapshot=lambda:{'base':'https://model.invalid/v1','model':'test-model'}
    def tearDown(self):
        self.tmp.cleanup()
    def test_agent_creates_task_and_wakes_then_suspends(self):
        agent.complete=lambda messages,cfg:'{"type":"final","answer":"Plan reviewed.","nextStep":"Collect the first evidence.","blocker":"","workbenchActions":[{"type":"create_task","title":"Collect evidence","plannedMinutes":25,"important":true},{"type":"delete_task","taskId":"unsafe"}]}'
        result=agent.run_agent({'question':'Review my current deadline plan','createTask':True,'taskTitle':'Deadline review','accountId':self.account,'sessionId':'session-a','workbenchContext':{'liveAgentContext':'test'}})
        self.assertTrue(result['ok'])
        self.assertTrue(result['taskId'])
        self.assertEqual(result['loop']['endedWithFinal'],True)
        self.assertEqual(result['workbenchActions'][0]['type'],'create_task')
        self.assertEqual(len(result['workbenchActions']),1,'unsupported Agent actions must be removed')
        events=autoloop.get_state(self.account,limit=80)['events']
        types=[x['eventType'] for x in events]
        self.assertIn('agent.woken',types)
        self.assertIn('agent.suspended',types)
    def test_agent_can_read_shared_autoloop_state_and_checkpoint_each_tool(self):
        created=agent.create_task({'title':'Evidence task','goal':'Read evidence','accountId':self.account,'sessionId':'session-b'})
        responses=iter([
            '{"type":"tool_call","tool":"autoloop_get_state","arguments":{},"reason":"Recover current account state"}',
            '{"type":"final","answer":"Recovered state and saved the next step.","nextStep":"Inspect evidence.","blocker":""}'
        ])
        agent.complete=lambda messages,cfg:next(responses)
        result=agent.run_agent({'question':'Continue the evidence task','taskId':created['id'],'accountId':self.account,'sessionId':'session-b'})
        self.assertEqual(result['toolCalls'][0]['tool'],'autoloop_get_state')
        saved=agent.get_task(created['id'],self.account)
        self.assertEqual(saved['state']['step'],1)
        self.assertEqual(saved['state']['lastTool'],'autoloop_get_state')
    def test_agent_checkpoint_tool_cannot_overwrite_daily_plan(self):
        with self.assertRaises(Exception):
            agent.call_tool('autoloop_save_checkpoint',{'taskId':'daily-plan','snapshot':{}},self.account)

    def test_agent_can_read_only_current_request_uploaded_files(self):
        file_id='agent-test-upload-id'
        with agent.uploads._LOCK:
            agent.uploads._FILES[file_id]={'id':file_id,'name':'brief.txt','kind':'document','size':24,'content':'Acceptance criteria and next action.'}
        try:
            result=agent.call_tool('read_uploaded_file',{'fileId':file_id},self.account,[file_id])
            self.assertEqual(result['name'],'brief.txt')
            self.assertIn('Acceptance criteria',result['extractedText'])
            with self.assertRaises(Exception):
                agent.call_tool('read_uploaded_file',{'fileId':file_id},self.account,[])
        finally:
            with agent.uploads._LOCK:
                agent.uploads._FILES.pop(file_id,None)

    def test_agent_run_includes_uploaded_files_and_reads_them_before_final(self):
        file_id='agent-test-run-upload'
        with agent.uploads._LOCK:
            agent.uploads._FILES[file_id]={'id':file_id,'name':'rubric.txt','kind':'document','size':30,'content':'Must include a real evidence link.'}
        seen=[]
        responses=iter([
            '{"type":"tool_call","tool":"read_uploaded_file","arguments":{"fileId":"'+file_id+'"},"reason":"Read the user acceptance rubric"}',
            '{"type":"final","answer":"I read the uploaded rubric.","nextStep":"Collect the evidence link.","blocker":""}'
        ])
        def fake_complete(messages,cfg):
            seen.append(messages)
            return next(responses)
        original=agent.complete
        agent.complete=fake_complete
        try:
            result=agent.run_agent({'question':'Use my attached acceptance rubric','createTask':True,'accountId':self.account,'sessionId':'upload-session','fileIds':[file_id],'urls':['https://example.com/rubric']})
            self.assertTrue(result['ok'])
            self.assertEqual(result['toolCalls'][0]['tool'],'read_uploaded_file')
            self.assertIn(file_id,str(seen[0]))
            self.assertIn('https://example.com/rubric',str(seen[0]))
            self.assertIn('Must include a real evidence link',str(seen[1]))
        finally:
            agent.complete=original
            with agent.uploads._LOCK:
                agent.uploads._FILES.pop(file_id,None)

    def test_agent_media_analysis_uses_only_current_request_files(self):
        from unittest.mock import patch
        file_id='agent-test-image'
        with agent.uploads._LOCK:
            agent.uploads._FILES[file_id]={'id':file_id,'name':'screen.png','kind':'image','size':100,'content':'OCR: task status'}
        try:
            with patch('p2_chat_backend.ask',return_value={'ok':True,'reply':'Observed a task list.','media':[{'name':'screen.png','frames':1}],'sources':[],'sourceDocuments':[]}):
                result=agent.call_tool('analyze_uploaded_media',{'question':'Inspect the screenshot','fileIds':[file_id]},self.account,[file_id])
            self.assertIn('Observed a task list',result['reply'])
            with self.assertRaises(Exception):
                agent.call_tool('analyze_uploaded_media',{'question':'Inspect','fileIds':['not-authorized']},self.account,[file_id])
        finally:
            with agent.uploads._LOCK:
                agent.uploads._FILES.pop(file_id,None)

if __name__=='__main__':
    unittest.main()
