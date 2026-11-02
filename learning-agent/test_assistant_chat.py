import json
import unittest
from unittest.mock import patch
import assistant_chat


class AssistantChatTests(unittest.TestCase):
    def test_live_chat_returns_reply_and_uncommitted_drafts(self):
        raw = json.dumps({"reply":"我理解你要在DDL前交付作品。先把材料缺口拆出来。",
                          "questions":["你的最终截止时间是哪一天？"],
                          "task_drafts":[{"title":"核对评分标准","estimate_minutes":25,
                            "deliverable":"评分标准对照表","acceptance_criteria":["每项标准有来源和对应作品位置"],
                            "deadline":"","depends_on_titles":[],"priority":1,"parallel":False}],
                          "schedule_notes":["固定时间不挤占；空档不足时标记未安排"],"confidence":"medium"},ensure_ascii=False)
        with patch.object(assistant_chat.rescue,"public_config",return_value={"configured":True}), \
             patch.object(assistant_chat.rescue,"complete",return_value=raw) as call:
            result=assistant_chat.respond({"messages":[{"role":"user","content":"帮我按DDL拆解任务"}],
                                           "context":{"tasks":[],"fixed":[]}})
        self.assertEqual(result["reply"],"我理解你要在DDL前交付作品。先把材料缺口拆出来。")
        self.assertEqual(result["task_drafts"][0]["estimate_minutes"],25)
        self.assertFalse(result["written_to_tasks"])
        self.assertEqual(call.call_count,1)

    def test_requires_real_model_connection(self):
        with patch.object(assistant_chat.rescue,"public_config",return_value={"configured":False}):
            with self.assertRaises(assistant_chat.rescue.RescueError):
                assistant_chat.respond({"messages":[{"role":"user","content":"你好"}],"context":{}})

    def test_rejects_malformed_task_draft(self):
        raw=json.dumps({"reply":"先做这一步","task_drafts":[{"title":"任务","estimate_minutes":0,
                          "deliverable":"产物","acceptance_criteria":["能检查"]}]},ensure_ascii=False)
        with patch.object(assistant_chat.rescue,"public_config",return_value={"configured":True}), \
             patch.object(assistant_chat.rescue,"complete",return_value=raw):
            with self.assertRaises(assistant_chat.rescue.RescueError):
                assistant_chat.respond({"messages":[{"role":"user","content":"拆任务"}],"context":{}})


if __name__ == "__main__":
    unittest.main()
