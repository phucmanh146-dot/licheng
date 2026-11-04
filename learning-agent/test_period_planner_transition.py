import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
import period_planner


def project_with(tasks):
    return {
        "diagnosis": {"member_profiles": [{"member_id": "m1"}]},
        "plan": {"plan_version": 1, "tasks": tasks, "time_blocks": [], "unscheduled": []},
    }


class PeriodPlannerTransitionTests(unittest.TestCase):
    def base_task(self, task_id, important, minutes=60, steps=None):
        return {
            "task_id": task_id, "title": task_id, "owner_ids": ["m1"],
            "status": "scheduled", "deadline": "2026-11-05",
            "estimate_minutes_range": [minutes, minutes],
            "depends_on": [], "is_important": important,
            "steps": steps or ["step"],
        }

    def settings(self, ids, **extra):
        return {
            "member_id": "m1", "period_start": "2026-11-04", "period_end": "2026-11-05",
            "daily_limit": 180, "buffer_minutes": 0, "transition_buffer_minutes": 10,
            "chunk_minutes": 60, "allow_split": True,
            "selected_task_ids": ids,
            "windows": [
                {"date": "2026-11-04", "start": "09:00", "end": "12:00"},
                {"date": "2026-11-05", "start": "09:00", "end": "12:00"},
            ],
            "busy": [], "full_dates": [],
            **extra,
        }

    def test_transition_buffer_is_a_real_reserved_gap_between_different_tasks(self):
        tasks = [self.base_task("important-a", True), self.base_task("important-b", True)]
        plan = period_planner.compute(project_with(tasks), self.settings(["important-a", "important-b"]),
            datetime(2026,11,4,8,0,tzinfo=ZoneInfo("Asia/Shanghai")))
        blocks = sorted(plan["time_blocks"], key=lambda x:x["start"])
        self.assertEqual(blocks[0]["task_id"], "important-a")
        self.assertEqual(blocks[1]["task_id"], "important-b")
        gap = (datetime.fromisoformat(blocks[1]["start"]) - datetime.fromisoformat(blocks[0]["end"])).total_seconds() // 60
        self.assertGreaterEqual(gap, 10)
        self.assertEqual(plan["schedule_summary"]["transition_buffer_reserved"], 10)
        self.assertEqual(len(plan["transition_buffers"]), 1)


    def test_unscheduled_tasks_keep_first_seen_time_and_24h_triage_deadline(self):
        task = self.base_task("overloaded", True, 60)
        settings = self.settings(["overloaded"], daily_limit=15, transition_buffer_minutes=0,
            windows=[
                {"date":"2026-11-04","start":"09:00","end":"09:15"},
                {"date":"2026-11-05","start":"09:00","end":"09:15"},
            ])
        plan = period_planner.compute(project_with([task]), settings,
            datetime(2026,11,4,8,0,tzinfo=ZoneInfo("Asia/Shanghai")))
        missing = next(x for x in plan["unscheduled"] if isinstance(x,dict))
        self.assertEqual(missing["task_id"], "overloaded")
        self.assertEqual(missing["unscheduled_since"], "2026-11-04T08:00+08:00")
        self.assertEqual(missing["triage_due_at"], "2026-11-05T08:00+08:00")

    def test_many_unimportant_task_gets_next_day_fixed_slot(self):
        task = self.base_task("batch", False, 90, ["a","b","c","d"])
        plan = period_planner.compute(project_with([task]), self.settings(["batch"]),
            datetime(2026,11,4,8,0,tzinfo=ZoneInfo("Asia/Shanghai")))
        fixed = plan["schedule_summary"]["next_day_fixed_reservations"]
        self.assertEqual(len(fixed), 1)
        self.assertEqual(fixed[0]["task_id"], "batch")
        self.assertEqual(fixed[0]["reservation_type"], "next_day_fixed")
        self.assertTrue(fixed[0]["start"].startswith("2026-11-05"))


if __name__ == "__main__":
    unittest.main()
