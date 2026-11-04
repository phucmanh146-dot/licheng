import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from deadline_policy import (
    deadline_review_due, classify_quadrant, rank_tasks,
    capacity_decision, unscheduled_triage_due, next_day_reservations,
)


class DeadlinePolicyTests(unittest.TestCase):
    def test_three_day_decision_starts_at_1500_local(self):
        zone = ZoneInfo("Asia/Shanghai")
        self.assertFalse(deadline_review_due("2026-11-07", datetime(2026,11,4,14,59,tzinfo=zone)))
        self.assertTrue(deadline_review_due("2026-11-07", datetime(2026,11,4,15,0,tzinfo=zone)))
        self.assertTrue(deadline_review_due("2026-11-07", datetime(2026,11,5,9,0,tzinfo=zone)))

    def test_four_quadrants_use_workload_and_explicit_importance(self):
        self.assertEqual(classify_quadrant({"is_important":True,"remaining_minutes":240}), "many_important")
        self.assertEqual(classify_quadrant({"is_important":True,"remaining_minutes":30}), "few_important")
        self.assertEqual(classify_quadrant({"is_important":False,"steps":[1,2,3,4]}), "many_unimportant")
        self.assertEqual(classify_quadrant({"is_important":False,"remaining_minutes":20}), "few_unimportant")
        self.assertEqual(classify_quadrant({"remaining_minutes":20}), "importance_unconfirmed")

    def test_priority_order_and_completed_tasks_excluded(self):
        tasks = [
            {"task_id":"q4","is_important":False,"remaining_minutes":20},
            {"task_id":"q2","is_important":False,"remaining_minutes":240},
            {"task_id":"q3","is_important":True,"remaining_minutes":20},
            {"task_id":"q1","is_important":True,"remaining_minutes":240},
            {"task_id":"done","is_important":True,"remaining_minutes":600,"status":"completed"},
        ]
        self.assertEqual([x["task_id"] for x in rank_tasks(tasks)], ["q1","q3","q2","q4"])

    def test_capacity_shortfall_asks_before_soft_deferral(self):
        result = capacity_decision([
            {"task_id":"must","is_important":True,"remaining_minutes":180},
            {"task_id":"optional","is_important":False,"remaining_minutes":90},
        ], available_minutes=200, transition_buffer_minutes=10)
        self.assertTrue(result["needs_user_decision"])
        self.assertEqual(result["shortfall_minutes"], 80)
        self.assertEqual([x["task_id"] for x in result["drop_candidates"]], ["optional"])
        self.assertEqual([x["task_id"] for x in result["protected_tasks"]], ["must"])

    def test_transition_buffer_is_reserved_between_tasks(self):
        result = capacity_decision([
            {"task_id":"a","is_important":True,"remaining_minutes":60},
            {"task_id":"b","is_important":True,"remaining_minutes":60},
        ], available_minutes=130, transition_buffer_minutes=10)
        self.assertEqual(result["transition_buffer_minutes"], 10)
        self.assertTrue(result["fits"])

    def test_unscheduled_task_must_be_triaged_within_24_hours(self):
        zone = ZoneInfo("Asia/Shanghai")
        created = datetime(2026,11,4,10,0,tzinfo=zone)
        self.assertFalse(unscheduled_triage_due(created.isoformat(), datetime(2026,11,5,9,59,tzinfo=zone)))
        self.assertTrue(unscheduled_triage_due(created.isoformat(), datetime(2026,11,5,10,0,tzinfo=zone)))

    def test_many_unimportant_tasks_get_next_day_fixed_reservation(self):
        tasks = [{"task_id":"batch","is_important":False,"steps":[1,2,3,4,5],"remaining_minutes":90}]
        self.assertEqual(next_day_reservations(tasks,"2026-11-05"),
                         [{"task_id":"batch","date":"2026-11-05","minutes":60,"kind":"fixed_reservation"}])


if __name__ == "__main__":
    unittest.main()
