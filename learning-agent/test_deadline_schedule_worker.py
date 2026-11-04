import unittest
from unittest.mock import patch
import deadline_schedule


class DeadlineScheduleWorkerTests(unittest.TestCase):
    def run_record(self):
        return {"id":"run-1","lease_token":"lease-1"}

    def project(self, saved=True):
        plan = {
            "plan_version": 2,
            "tasks": [{
                "task_id":"task-1","title":"重要任务","owner_ids":["m1"],
                "status":"scheduled","deadline":"2026-11-07",
                "estimate_minutes_range":[60,90],"depends_on":[],
                "steps":["a"],"is_important":True,
            }],
            "time_blocks": [], "unscheduled": [],
        }
        if saved:
            plan["replanning_context"] = {
                "member_id":"m1","period_start":"2026-11-04","period_end":"2026-11-07",
                "daily_limit":180,"buffer_minutes":10,"transition_buffer_minutes":10,
                "chunk_minutes":60,"allow_split":True,"selected_task_ids":["task-1"],
                "windows":[{"date":"2026-11-05","start":"09:00","end":"12:00"}],
                "busy":[],"full_dates":[],"remaining_minutes":{},
            }
        return {
            "project_id":"project-1","version":7,"mode":"live","plan":plan,
            "plan_stale":False,"diagnosis":{"member_profiles":[{"member_id":"m1"}]},
        }

    def test_no_saved_availability_stops_for_user_instead_of_inventing_free_time(self):
        project = self.project(saved=False)
        with (
            patch.object(deadline_schedule.team,"state",return_value=project),
            patch.object(deadline_schedule.store,"event") as event,
            patch.object(research_graph.store,"finish") as finish,
        ):
            result = deadline_schedule.execute(
                self.run_record(),{"project_id":"project-1","event_type":"deadline.approaching"})
        self.assertTrue(result["approval_required"])
        self.assertTrue(result["needs_availability_update"])
        self.assertEqual(finish.call_args.args[2],"awaiting_confirmation")
        self.assertIn("可用时间窗",result["approval_reasons"][0])

    def test_fit_schedule_is_auto_adopted_without_running_research_graph(self):
        project = self.project()
        planned = {**project["plan"],"schedule_summary":{"fits":True,"unallocated":[]}}
        proposal = {**project,"version":8,"proposal":{"id":"proposal-1","plan":planned}}
        adopted = {**project,"version":9,"plan":planned}
        with (
            patch.object(research_graph.team,"state",return_value=project),
            patch.object(deadline_schedule.period_planner,"compute",return_value=planned) as compute,
            patch.object(research_graph.team,"propose",return_value=proposal),
            patch.object(research_graph.team,"apply_automated",return_value=adopted) as apply,
            patch.object(research_graph.store,"event") as event,
            patch.object(research_graph.store,"finish") as finish,
        ):
            result = research_graph.execute_schedule_event(
                self.run_record(),{"project_id":"project-1","event_type":"deadline.approaching"})
        self.assertTrue(result["auto_adopted"])
        self.assertEqual(apply.call_count,1)
        self.assertEqual(finish.call_args.args[2],"succeeded")
        self.assertEqual(compute.call_args.args[1]["selected_task_ids"],["task-1"])

    def test_capacity_shortfall_waits_for_user_and_never_auto_adopts(self):
        project = self.project()
        planned = {**project["plan"],"schedule_summary":{
            "fits":False,"unallocated":[{"task_id":"task-1","minutes":30}],
        }}
        proposal = {**project,"version":8,"proposal":{"id":"proposal-2","plan":planned}}
        with (
            patch.object(research_graph.team,"state",return_value=project),
            patch.object(research_graph.period_planner,"compute",return_value=planned),
            patch.object(research_graph.team,"propose",return_value=proposal),
            patch.object(research_graph.team,"apply_automated") as apply,
            patch.object(research_graph.store,"event"),
            patch.object(research_graph.store,"finish") as finish,
        ):
            result = research_graph.execute_schedule_event(
                self.run_record(),{"project_id":"project-1","event_type":"task.unscheduled_triage"})
        self.assertFalse(result["auto_adopted"])
        self.assertTrue(result["approval_required"])
        self.assertTrue(result["soft_defer_only"])
        self.assertEqual(finish.call_args.args[2],"awaiting_confirmation")
        apply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
