import unittest
from evaluate_reranker import ranking_metrics, evaluate


class RerankerEvaluationTests(unittest.TestCase):
    def test_perfect_ranking_scores_one(self):
        expected = {("a", 1, "line:1"), ("b", 2, "line:2")}
        rows = [{"artifact_id":a,"artifact_version":v,"locator":loc}
                for a,v,loc in expected]
        result = ranking_metrics(rows, expected)
        self.assertEqual(result["recall_at_5"], 1)
        self.assertEqual(result["precision_at_5"], 0.4)
        self.assertEqual(result["mrr_at_10"], 1)
        self.assertEqual(result["ndcg_at_5"], 1)

    def test_wrong_first_result_reduces_reciprocal_rank(self):
        expected = {("good", 1, "line:1")}
        rows = [
            {"artifact_id":"bad","artifact_version":1,"locator":"line:1"},
            {"artifact_id":"good","artifact_version":1,"locator":"line:1"},
        ]
        result = ranking_metrics(rows, expected)
        self.assertEqual(result["mrr_at_10"], 0.5)
        self.assertEqual(result["recall_at_5"], 1)

    def test_no_model_generated_ground_truth(self):
        with self.assertRaisesRegex(ValueError, "30条人工标注"):
            evaluate({"human_labeled":False,"cases":[]})


if __name__ == "__main__":
    unittest.main()
