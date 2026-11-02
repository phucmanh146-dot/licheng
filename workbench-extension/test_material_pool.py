"""Storage, provenance and pairing contracts. Fixtures, not live desktop evidence."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

TEMP = tempfile.TemporaryDirectory()
os.environ['SHANGAN_GROWTH_DATA'] = TEMP.name
sys.path.insert(0, str(Path(__file__).parent))
import growth_materials as pool
import growth_obsidian as obsidian
import growth_pipeline as flow


class Materials(unittest.TestCase):
    def setUp(self):
        pool.setup()
        with flow.connect() as db:
            db.execute('DELETE FROM materials')
            db.execute('DELETE FROM projects')
            db.execute('DELETE FROM runs')

    def test_dedup_persistence_selection_and_account_partition(self):
        item = {'source':'wechat', 'title':'所选消息', 'content':'真实导入正文示例', 'sourceRef':'所选内容'}
        first = pool.add('alice',[item])['materials'][0]
        self.assertEqual(pool.add('alice',[item])['existingIds'],[first['id']])
        pool.change({'account':'alice','id':first['id'],'action':'select','selected':False})
        self.assertFalse(pool.listing('alice')['materials'][0]['selected'])
        self.assertEqual(pool.listing('bob')['materials'],[])
        with self.assertRaises(ValueError):
            pool.change({'account':'bob','id':first['id'],'action':'remove'})
        with self.assertRaises(ValueError):
            pool.selected('bob',[first['id']])

    def test_empty_and_link_only_materials_are_not_evidence(self):
        for item in [{'content':''},{'source':'web','content':'https://example.org','sourceRef':'https://example.org'}, {'source':'web','content':'只有摘要','thin':True}]:
            with self.assertRaises(ValueError): pool.add('alice',[item])
        self.assertEqual(pool.listing('alice')['materials'],[])

    def test_batch_is_atomic_and_bounded(self):
        with self.assertRaises(ValueError):
            pool.add('alice',[{'content':'有效正文'},{'content':'x'*30001}])
        self.assertEqual(pool.listing('alice')['materials'],[])

    def test_pipeline_resolves_only_selected_server_bodies(self):
        ids = pool.add('alice',[{'title':'选择的笔记','content':'应该给模型的原始正文'}, {'title':'未选择','content':'不应进入模型上下文'}])['addedIds']
        project = flow.save_project({'account':'alice','title':'目标','dailyMinutes':30})
        with patch.object(flow.POOL,'submit') as queued:
            flow.start({'account':'alice','projectId':project['id'],'materialIds':[ids[0]],'materials':[]})
            body = queued.call_args.args[2]
        flow.GATE.release()
        self.assertEqual(len(body['input']['materials']),1)
        self.assertEqual(body['input']['materials'][0]['text'],'应该给模型的原始正文')
        self.assertEqual(body['input']['materials'][0]['materialId'],ids[0])
        self.assertNotIn('不应进入模型上下文',flow.encode(body))


class Obsidian(unittest.TestCase):
    def setUp(self):
        obsidian.pending_pairs.clear(); obsidian.jobs.clear(); obsidian.sessions.clear()
        obsidian.PAIRS = Path(TEMP.name)/'pairs.json'
        obsidian.PAIRS.unlink(missing_ok=True)

    def pair(self, vault='a'*32):
        uri=obsidian.pair_start()['url']
        code=parse_qs(urlparse(uri).query)['code'][0]
        token=obsidian.register({'code':code,'vaultId':vault})['token']
        return vault,token,code

    def heartbeat(self,vault,token,**extra):
        return obsidian.poll({'vaultId':vault,'vaultName':'测试库','focused':True,'recent':[{'path':'学习/笔记.md'}],**extra},token)

    def test_pair_code_single_use_and_no_secret_in_status(self):
        vault,token,code=self.pair()
        with self.assertRaises(ValueError):obsidian.register({'code':code,'vaultId':vault})
        with self.assertRaises(PermissionError):self.heartbeat(vault,'wrong-token')
        self.heartbeat(vault,token)
        self.assertNotIn(token,json.dumps(obsidian.status()))
        self.assertNotIn(token,obsidian.PAIRS.read_text())
        self.assertEqual(obsidian.status()['vaults'][0]['recent'][0]['path'],'学习/笔记.md')

    def test_disconnected_plugin_cannot_claim_connected(self):
        vault,token,_=self.pair();self.heartbeat(vault,token)
        obsidian.sessions[vault]['seen']-=20
        self.assertFalse(obsidian.status()['connected'])
        with self.assertRaises(ValueError):obsidian.request(vault,'read',{'path':'学习/笔记.md'})

    def test_path_traversal_and_configuration_files_denied(self):
        for path in ['../private.md','.obsidian/data.md','C:/private.md','folder//note.md','folder/../note.md','data.json','/note.md']:
            with self.assertRaises(ValueError):obsidian.safe_path(path)

    def test_actual_reply_required_and_not_shared_across_vaults(self):
        vault,token,_=self.pair();self.heartbeat(vault,token)
        other,other_token,_=self.pair('b'*32);self.heartbeat(other,other_token)
        result={}
        thread=threading.Thread(target=lambda:result.update(obsidian.request(vault,'read',{'path':'学习/笔记.md'})))
        thread.start()
        for _ in range(30):
            if obsidian.jobs:break
            time.sleep(.01)
        self.assertEqual(self.heartbeat(other,other_token)['jobs'],[])
        job=self.heartbeat(vault,token)['jobs'][0]
        self.heartbeat(other,other_token,results=[{'id':job['id'],'content':'错误库的内容'}])
        self.assertTrue(thread.is_alive())
        self.heartbeat(vault,token,results=[{'id':job['id'],'content':'实际读取返回的笔记正文'}])
        thread.join(1)
        self.assertEqual(result['content'],'实际读取返回的笔记正文')
        self.assertEqual(self.heartbeat(vault,token)['jobs'],[])


if __name__ == '__main__':unittest.main()
