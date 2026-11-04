"""Transparent AI-effort accounting.

Token counts are estimates from character counts unless a provider returns usage.
This module deliberately does not invent monetary cost or claim ROI from valid JSON.
"""
from math import ceil


def estimate_tokens(characters):
    return max(0, ceil(max(0, int(characters)) / 4))


def summarize_attempts(attempts, elapsed_ms, validated):
    rows = attempts if isinstance(attempts, list) else []
    input_chars = sum(max(0, int(row.get("request_chars", 0))) for row in rows)
    output_chars = sum(max(0, int(row.get("response_chars", 0))) for row in rows)
    calls = len(rows)
    return {
        "model_calls": calls,
        "validation_retries": max(0, calls - 1),
        "input_characters": input_chars,
        "output_characters": output_chars,
        "estimated_input_tokens": estimate_tokens(input_chars),
        "estimated_output_tokens": estimate_tokens(output_chars),
        "estimated_total_tokens": estimate_tokens(input_chars) + estimate_tokens(output_chars),
        "elapsed_ms": max(0, int(elapsed_ms)),
        "validation_passed": bool(validated),
        "validation_scope": "schema_and_source_checks_not_human_acceptance",
        "provider_usage_available": False,
        "actual_cost": None,
        "roi_status": "pending_verified_deliverable_and_measured_baseline",
        "cost_note": "字符/4仅为估算；未取得供应商usage与价格，不能换算真实费用。",
    }


def should_reuse_cached_result(input_sha256, cached_sha256, cached_validation_passed):
    """Only reuse a same-input result that previously passed the same validation gate."""
    return bool(input_sha256 and cached_sha256 and input_sha256 == cached_sha256
                and cached_validation_passed is True)
