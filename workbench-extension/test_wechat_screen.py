"""Fixture tests; no desktop capture, WeChat input, or private message reads."""
from contextlib import nullcontext
import time
import unittest
from unittest.mock import patch
import growth_wechat_screen as screen
import growth_wechat as wx


def document(items):
    return {'width': 1000, 'height': 800, 'lines': [
        {'text': text, 'words': [{'text': text, 'x': x, 'y': y, 'width': 120, 'height': 20}]}
        for text, x, y in items]}


class SharedWindowTests(unittest.TestCase):
    def tearDown(self):
        screen.cancel(); wx.CANCEL.clear()

    def test_groups_messages_and_counts_remain_distinct(self):
        doc = document([('RAG', 90, 30), ('群 聊 (2)', 90, 100), ('RAG 学习群', 90, 140),
            ('聊天记录', 90, 200), ('3条相关聊天记录', 90, 230), ('同学：RAG资料', 90, 260),
            ('RAG 无关正文', 750, 280), ('联系人', 90, 320), ('RAG 联系人', 90, 350)])
        result = screen.parse_results(doc, 'RAG')
        self.assertEqual([g['name'] for g in result['groups']], ['RAG 学习群'])
        self.assertEqual(result['messages'], [{'text': '同学：RAG资料'}])
        self.assertEqual(result['conversations'], ['3条相关聊天记录'])
        self.assertIn('可能有错字', result['note'])
        self.assertEqual(result['contacts'],[{'name':'RAG 联系人'}])

    def test_unknown_frame_is_not_empty_search_success(self):
        with self.assertRaises(screen.RescueError):
            screen.parse_results(document([('RAG', 90, 30), ('RAG日常聊天', 90, 140)]), 'RAG')

    def test_old_query_cannot_be_reused(self):
        with self.assertRaises(screen.RescueError) as err:
            screen.parse_results(document([('旧关键词', 90, 30), ('群聊', 90, 100), ('RAG学习群', 90, 150)]), 'RAG')
        self.assertEqual(err.exception.code, 'WECHAT_SCREEN_QUERY_CHANGED')

    def test_explicit_empty_result(self):
        result = screen.parse_results(document([('RAG', 90, 30), ('无搜索结果', 90, 170)]), 'RAG')
        self.assertTrue(result['empty']); self.assertEqual(result['count'], 0)

    def test_ambiguous_search_control_rejected(self):
        with self.assertRaises(screen.RescueError):
            screen.search_anchor(document([('搜索', 90, 30), ('搜索', 290, 30)]))
        self.assertEqual(screen.search_anchor(document([('搜索', 90, 30)]))['x'], 90)
        self.assertEqual(screen.search_anchor(document([('feishu', 90, 30)]), 'feishu')['text'], 'feishu')

    def test_browser_tab_and_entire_screen_are_rejected(self):
        for surface, label in [('monitor', '微信'), ('browser', '微信')]:
            with self.assertRaises(screen.RescueError):
                screen.check_shared({'displaySurface': surface, 'windowLabel': label})
        screen.check_shared({'displaySurface': 'window', 'windowLabel': '微信'})
        screen.check_shared({'displaySurface': 'window', 'windowLabel': 'window:123:0'})

    def test_cancel_during_ocr_never_focuses_window(self):
        def cancelled(_): wx.CANCEL.set(); return document([('搜索', 90, 30)])
        with patch.object(screen, 'automation', return_value=nullcontext()), patch.object(screen, 'physical_pixels', return_value=nullcontext()), patch.object(screen, 'read_frame', side_effect=cancelled), patch.object(screen, 'matching_window') as match:
            with self.assertRaises(screen.RescueError):
                screen.start_search({'displaySurface': 'window', 'windowLabel': '微信', 'keyword': 'RAG', 'image': 'fixture'})
            match.assert_not_called()

    def test_manual_frame_read_never_automates_native_window(self):
        doc = document([('RAG', 90, 30), ('群聊', 90, 150), ('RAG学习群', 90, 180)])
        with patch.object(screen, 'read_frame', return_value=doc), patch.object(screen, 'matching_window') as match:
            result = screen.finish_search({'displaySurface': 'window', 'windowLabel': 'window', 'keyword': 'RAG', 'manual': True, 'image': 'fixture'})
            self.assertEqual(result['groupCount'], 1)
            match.assert_not_called()

    def test_selected_group_must_match_visible_chat_title(self):
        doc = document([('测试学习群', 400, 20), ('聊天记录', 500, 70), ('RAG', 500, 110), ('RAG 资料链接', 500, 170), ('其他列 RAG', 80, 220)])
        result = screen.parse_group_results(doc, '测试学习群', 'RAG')
        self.assertEqual(result['messages'], [{'text':'RAG 资料链接','group':'测试学习群'}])
        with self.assertRaises(screen.RescueError): screen.parse_group_results(doc, '另一个群', 'RAG')

    def test_expired_read_never_requests_ocr(self):
        screen.PENDING['expired'] = {'until': time.monotonic()-1, 'keyword': 'RAG', 'hwnd': 1}
        with patch.object(screen, 'read_frame') as read:
            with self.assertRaises(screen.RescueError):
                screen.finish_search({'displaySurface': 'window', 'windowLabel': '微信', 'searchId': 'expired'})
            read.assert_not_called()

    def test_follow_reads_new_visible_query_without_operating_wechat(self):
        doc=document([('分享',90,30),('联系人',90,120),('分享同学',90,160)])
        with patch.object(screen,'read_frame',return_value=doc), patch.object(screen,'matching_window') as match:
            result=screen.follow_results({'displaySurface':'window','image':'fixture'})
        self.assertEqual(result['keyword'],'分享'); self.assertEqual(result['contacts'],[{'name':'分享同学'}]);match.assert_not_called()

    def test_follow_does_not_infer_queries_from_normal_chat_text(self):
        doc=document([('小明',430,30),('RAG的学习资料',500,200)])
        with patch.object(screen,'read_frame',return_value=doc):
            result=screen.follow_results({'displaySurface':'window','image':'fixture'})
        self.assertTrue(result['idle']); self.assertEqual(result['messages'],[])

    def test_follow_rejects_ambiguous_query(self):
        doc=document([('分享',90,30),('第二个标题',90,70),('联系人',90,120),('分享同学',90,160)])
        self.assertEqual(screen.visible_query(doc),'')

    def test_navigation_row_has_correct_category_and_exact_name(self):
        doc=document([('RAG',90,30),('群聊',90,100),('RAG伙伴',90,140),('联系人',90,200),('RAG伙伴',90,240)])
        self.assertEqual(screen.choice_row(doc,'RAG','contact','RAG伙伴')['y'],240)
        self.assertEqual(screen.choice_row(doc,'RAG','group','RAG伙伴')['y'],140)
        with self.assertRaises(screen.RescueError):screen.choice_row(doc,'RAG','contact','RAG')

    def test_same_name_within_one_section_cannot_be_opened(self):
        doc=document([('RAG',90,30),('联系人',90,120),('RAG伙伴',90,160),('RAG伙伴',90,200)])
        with self.assertRaises(screen.RescueError):screen.choice_row(doc,'RAG','contact','RAG伙伴')

    def test_similar_group_name_cannot_supply_evidence(self):
        doc=document([('测试学习群2',400,20),('聊天记录',500,70),('RAG',500,110),('RAG资料',500,170)])
        with self.assertRaises(screen.RescueError):screen.parse_group_results(doc,'测试学习群','RAG')

    def test_user_movement_during_ocr_prevents_navigation(self):
        doc=document([('RAG',90,30),('联系人',90,120),('RAG伙伴',90,160)])
        with patch.object(screen,'automation',return_value=nullcontext()), patch.object(screen,'physical_pixels',return_value=nullcontext()), patch.object(screen,'read_frame',return_value=doc), patch.object(screen,'last_input_tick',side_effect=[10,20]), patch.object(screen,'matching_window') as match:
            with self.assertRaises(screen.RescueError) as error:
                screen.open_result({'displaySurface':'window','image':'fixture','keyword':'RAG','kind':'contact','name':'RAG伙伴'})
        self.assertEqual(error.exception.code,'WECHAT_USER_MOVED'); match.assert_not_called()


if __name__ == '__main__': unittest.main()
