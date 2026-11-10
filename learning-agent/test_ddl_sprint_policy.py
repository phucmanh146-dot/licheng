import unittest
from datetime import datetime, timezone, timedelta
from ddl_sprint_policy import evaluate_t3_fallback

TZ = timezone(timedelta(hours=8))

class T3FallbackTests(unittest.TestCase):
    def test_missed_t3_goes_to_t2(self):
        now = datetime(2026, 11, 10, 15, 0, tzinfo=TZ)
        tasks = [{"task_id":"a","title":"PPT","deadline":"2026-11-13T23:59:00+08:00",
                  "remaining_minutes":120,"importance":"重要","task_size":"大","status":"todo"}]
        r = evaluate_t3_fallback(tasks, [], now, {"2026-11-11":180})
        self.assertEqual(r["forced_queue"][0]["fallback_day"], "2026-11-11")
        self.assertEqual(r["forced_queue"][0]["quadrant"], "large_important")

    def test_fixed_and_daily_fixed_are_protected(self):
        now = datetime(2026, 11, 10, 15, 0, tzinfo=TZ)
        tasks = [{"task_id":"class","deadline":"2026-11-13T23:59:00+08:00","remaining_minutes":60,
                  "task_mode":"fixed"}, {"task_id":"daily","deadline":"2026-11-13T23:59:00+08:00",
                  "remaining_minutes":40,"task_mode":"daily_fixed"}]
        r = evaluate_t3_fallback(tasks, [], now, {})
        self.assertEqual(r["forced_queue"], [])

    def test_capacity_overload_is_explicit(self):
        now = datetime(2026, 11, 10, 15, 0, tzinfo=TZ)
        tasks = [{"task_id":"a","deadline":"2026-11-13T23:59:00+08:00","remaining_minutes":180,
                  "importance":"重要","task_size":"大"}]
        r = evaluate_t3_fallback(tasks, [], now, {"2026-11-11":60})
        self.assertEqual(r["overload"][0]["overload_minutes"],120)
        self.assertIn("discard", r["overload"][0]["required_decision"])

    def test_plan_label_is_not_a_real_time_block(self):
        now = datetime(2026, 11, 10, 15, 0, tzinfo=TZ)
        tasks = [{"task_id":"a","deadline":"2026-11-13T23:59:00+08:00","remaining_minutes":90,
                  "status":"已排期","importance":"重要"}]
        r = evaluate_t3_fallback(tasks, [], now, {"2026-11-11":120})
        self.assertEqual(r["forced_queue"][0]["remaining_minutes"],90)

if __name__ == "__main__":
    unittest.main()
