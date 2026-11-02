"""Evaluate OCR only against human-transcribed, real scan samples."""
import argparse
import json
import unicodedata
from pathlib import Path


def normalize(text):
    return "".join(ch for ch in unicodedata.normalize("NFKC", text).casefold()
                   if not ch.isspace())


def edit_distance(left, right):
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (a != b)))
        previous = current
    return previous[-1]


def score_text(predicted, expected):
    pred, gold = normalize(predicted), normalize(expected)
    if not gold:
        raise ValueError("人工标注原文不能为空")
    errors = edit_distance(pred, gold)
    return {"characters": len(gold), "edit_errors": errors,
            "cer": errors / len(gold), "character_accuracy": max(0.0, 1 - errors / len(gold))}


def evaluate(dataset, base_dir):
    if dataset.get("human_labeled") is not True or not dataset.get("samples"):
        raise ValueError("需要真实扫描件和人工逐字转录，不能用模型自评替代")
    import artifact_store
    rows = []
    for sample in dataset["samples"]:
        path = (base_dir / sample["file"]).resolve()
        if base_dir.resolve() not in path.parents:
            raise ValueError("样本路径必须位于数据集目录内")
        parsed = artifact_store.parse(path.name, path.read_bytes())
        predicted = "\n".join(unit["text"] for unit in parsed["units"])
        metrics = score_text(predicted, sample["ground_truth"])
        rows.append({"id": sample["id"], "file": sample["file"], **metrics,
                     "ocr_statistics": parsed.get("statistics", {}),
                     "low_confidence_units": sum(bool(x.get("needs_confirmation"))
                                                 for x in parsed["units"])})
    total_chars = sum(row["characters"] for row in rows)
    total_errors = sum(row["edit_errors"] for row in rows)
    return {"sample_count": len(rows), "total_characters": total_chars,
            "total_edit_errors": total_errors,
            "corpus_cer": total_errors / max(1, total_chars),
            "mean_character_accuracy": sum(r["character_accuracy"] for r in rows) / len(rows),
            "samples": rows,
            "not_a_model_or_human_semantic_review": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset")
    parser.add_argument("--output", default="")
    args = parser.parse_args()
    source = Path(args.dataset).resolve()
    result = evaluate(json.loads(source.read_text(encoding="utf-8")), source.parent)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)
