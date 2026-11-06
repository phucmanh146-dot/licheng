import unittest

from ai_efficiency import estimate_tokens, summarize_attempts, should_reuse_cached_result


class AIEfficiencyTests(unittest.TestCase):
    def test_token_estimate_is_explicit_ceiling(self):
        self.assertEqual(estimate_tokens(1), 1)
        self.assertEqual(estimate_tokens(8), 2)
        self.assertEqual(estimate_tokens(0), 0)

    def test_summary_counts_retries_but_does_not_invent_cost_or_roi(self):
        result = summarize_attempts([
            {"request_chars": 400, "response_chars": 80},
            {"request_chars": 420, "response_chars": 100},
        ], 1250, True)
        self.assertEqual(result["model_calls"], 2)
        self.assertEqual(result["validation_retries"], 1)
        self.assertEqual(result["estimated_total_tokens"], 250)
        self.assertIsNone(result["actual_cost"])
        self.assertEqual(result["roi_status"], "pending_verified_deliverable_and_measured_baseline")
        self.assertFalse(result["provider_usage_available"])

    def test_cache_reuse_requires_same_input_and_passed_validation(self):
        self.assertTrue(should_reuse_cached_result("abc", "abc", True))
        self.assertFalse(should_reuse_cached_result("abc", "abc", False))
        self.assertFalse(should_reuse_cached_result("abc", "def", True))
        self.assertFalse(should_reuse_cached_result("", "", True))


if __name__ == "__main__":
    unittest.main()
