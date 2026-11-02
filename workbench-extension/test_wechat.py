"""Only search-scoped native controls can provide WeChat evidence."""
from contextlib import nullcontext
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import growth_wechat as wx


class Node:
    def __init__(self, name='', typ='Pane', parent=None, cls='mmui::Native', auto='', children=None):
        self.label, self.up = name, parent
        self.items = children or []
        self.element_info = SimpleNamespace(control_type=typ, class_name=cls, automation_id=auto)
    def window_text(self): return self.label
    def parent(self): return self.up
    def is_visible(self): return True
    def children(self, **kwargs): return self.items
    def descendants(self, **kwargs): return []


class WeChatTests(unittest.TestCase):
    def test_embedded_webpage_search_is_excluded(self):
        doc = Node(typ='Document')
        self.assertFalse(wx.native(Node('搜索', 'Edit', doc)))
        self.assertTrue(wx.native(Node('搜索', 'Edit', Node('微信'))))

    def test_only_matching_search_messages_are_read(self):
        chat = Node('聊天记录')
        good = Node('RAG 的学习资料', 'ListItem', chat)
        unrelated = Node('RAG群', 'ListItem', Node('联系人'))
        other = Node('无关消息', 'ListItem', chat)
        window = SimpleNamespace(descendants=lambda **kwargs: [good, unrelated, other])
        self.assertEqual(wx.matched_messages(window, 'RAG'), ['RAG 的学习资料'])

    def test_global_search_only_fills_identified_search_control(self):
        control, window = object(), object()
        with patch.object(wx, 'automation', return_value=nullcontext()), patch.object(wx, 'connect_window', return_value=window), patch.object(wx, 'search_boxes', return_value=[control]), patch.object(wx, 'fill') as fill, patch.object(wx, 'search_results', return_value={'groups':[],'messages':[{'text':'RAG 资料'}],'conversations':[]}), patch.object(wx.time, 'sleep'):
            result = wx.search_messages('RAG')
        fill.assert_called_once_with(control, 'RAG')
        self.assertEqual(result['count'], 1)
        self.assertIn('不代表全部聊天历史', result['text'])

    def test_multiline_query_never_reaches_computer(self):
        with patch.object(wx, 'connect_window') as connect:
            with self.assertRaises(wx.RescueError): wx.search_messages('RAG\n发送')
        connect.assert_not_called()

    def test_sibling_headers_separate_groups_messages_and_counts(self):
        items = [Node('群聊','ListItem'),Node('RAG 学习群','ListItem'),Node('聊天记录','ListItem'),Node('学习伙伴\n3条相关聊天记录','ListItem'),Node('同学：RAG 先检索再回答','ListItem'),Node('联系人','ListItem'),Node('RAG 助手','ListItem')]
        results = Node(typ='List',auto='search_list',children=items)
        window = SimpleNamespace(descendants=lambda **kwargs: [results] if kwargs.get('control_type')=='List' else [])
        data = wx.search_results(window,'RAG')
        self.assertEqual([g['name'] for g in data['groups']],['RAG 学习群'])
        self.assertEqual(data['messages'],[{'text':'同学：RAG 先检索再回答'}])
        self.assertEqual(len(data['conversations']),1)
        self.assertEqual(data['contacts'],[{'name':'RAG 助手','preview':'RAG 助手'}])

    def test_group_row_must_be_within_group_section(self):
        items = [Node('群聊','ListItem'), Node('学习群','ListItem'), Node('联系人','ListItem'), Node('学习群','ListItem')]
        container = Node(typ='List',auto='search_list',children=items)
        window = SimpleNamespace(descendants=lambda **kwargs:[container])
        self.assertEqual(wx.group_controls(window, '学习群'), [items[1]])

    def test_expired_group_cannot_trigger_wechat(self):
        with patch.object(wx, 'connect_window') as connect:
            with self.assertRaises(wx.RescueError): wx.read_group_messages('not-a-choice', 'RAG')
            connect.assert_not_called()

    def test_contact_in_general_search_results_is_not_a_message(self):
        node = Node('RAG 联系人','ListItem',Node('搜索结果'))
        window = SimpleNamespace(descendants=lambda **kwargs:[node])
        self.assertEqual(wx.matched_messages(window,'RAG'),[])

    def test_contact_navigation_never_uses_the_same_named_group(self):
        items = [Node('群聊','ListItem'), Node('学习伙伴','ListItem'), Node('联系人','ListItem'), Node('学习伙伴','ListItem')]
        container = Node(typ='List',auto='search_list',children=items)
        window = SimpleNamespace(descendants=lambda **kwargs:[container])
        self.assertEqual(wx.result_controls(window, 'contact', '学习伙伴'), [items[3]])

    def test_stale_navigation_cannot_operate_wechat(self):
        with patch.object(wx,'connect_window') as connect:
            with self.assertRaises(wx.RescueError): wx.open_choice('expired-fixture')
        connect.assert_not_called()

    def test_opening_an_opaque_client_never_types_or_clicks(self):
        window = SimpleNamespace(set_focus=lambda:None)
        with patch.object(wx,'automation',return_value=nullcontext()), patch.object(wx,'connect_window',return_value=window) as connect, patch.object(wx,'fill') as fill:
            self.assertTrue(wx.open_wechat()['ok'])
        connect.assert_called_once_with(allow_opaque=True); fill.assert_not_called()


if __name__ == '__main__': unittest.main()
