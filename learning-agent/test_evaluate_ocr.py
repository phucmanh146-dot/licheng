import unittest
from evaluate_ocr import score_text, normalize, edit_distance


class OcrMetricTests(unittest.TestCase):
    def test_exact_transcription(self):
        result = score_text("真实扫描材料 V1", "真实扫描材料 V1")
        self.assertEqual(result["cer"], 0)
        self.assertEqual(result["character_accuracy"], 1)

    def test_normalization_handles_whitespace_and_unicode_width(self):
        self.assertEqual(normalize("ＡＢＣ  １２３"), normalize("ABC123"))

    def test_character_error_rate_uses_human_reference(self):
        result = score_text("今天完成了V2", "今天完成V2")
        self.assertGreater(result["cer"], 0)
        self.assertLess(result["character_accuracy"], 1)

    def test_empty_gold_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "人工标注"):
            score_text("识别结果", "  ")

    def test_edit_distance(self):
        self.assertEqual(edit_distance("kitten", "sitting"), 3)


if __name__ == "__main__":
    unittest.main()
