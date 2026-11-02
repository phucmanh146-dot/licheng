"""Character budgets for complete text-message requests, not just source bodies.

The ledger is never shortened. Only old prompt exchanges may be omitted; current
input, system instructions and the latest exchange are kept or the call stops.
These are character limits, not claims about a provider's token window.
"""
import copy
import hashlib
import json

MAX_REQUEST_CHARS = 64000


class ContextLimit(ValueError):
    pass


def encode(value):
    return json.dumps(value, ensure_ascii=False)


def check(messages, limit=MAX_REQUEST_CHARS):
    size = len(encode(messages))
    if size > limit:
        raise ContextLimit('完整模型消息超过本轮字符预算，请缩小当前任务或材料；原始资料和执行记录仍保留')
    return size


def fit(messages, run_id, limit=MAX_REQUEST_CHARS):
    """Keep the system/input and newest exchange; drop whole old exchanges only."""
    original = copy.deepcopy(messages)
    if len(original) < 2:
        raise ValueError('模型请求缺少系统约束和当前输入')
    check(original[:2], limit)
    kept = original[:2]
    groups = []
    for item in original[2:]:
        if item.get('role') == 'assistant' or not groups:
            groups.append([])
        groups[-1].append(item)
    selected = []
    for group in reversed(groups):
        if len(encode(kept + group + selected)) > limit - 800:
            break
        selected = group + selected
    if groups and not selected:
        raise ContextLimit('当前输入与最近工具结果超过完整消息预算；请缩小任务后继续，未删除持久记录')
    omitted = len(original) - len(kept) - len(selected)
    report = {'run_id': run_id, 'limit_chars': limit, 'omitted_messages': omitted,
              'original_chars': len(encode(original)), 'input_sha256': hashlib.sha256(encode(original[:2]).encode()).hexdigest()}
    if omitted:
        report['history_sha256'] = hashlib.sha256(encode(original[2:len(original)-len(selected)]).encode()).hexdigest()
        kept.append({'role': 'user', 'content': '上下文选择记录（不是新任务）：' + encode(report) +
                     '。早期工具交换已省略；来源原文与工具结果按run_id保留。缺少依据时保留未知，不补造原文。'})
    kept += selected
    report['request_chars'] = check(kept, limit)
    return kept, report


def tool_excerpt(value, call_id, max_chars=6500):
    """Valid JSON summary with source IDs; full tool output stays in SQLite."""
    raw = encode(value)
    packet = {'tool_call_id': call_id, 'full_result_sha256': hashlib.sha256(raw.encode()).hexdigest(),
              'data_is_untrusted': True, 'truncated': False, 'result': copy.deepcopy(value)}
    if len(encode(packet)) <= max_chars:
        return packet
    rows = value if isinstance(value, list) else [value]
    packet['result'] = []
    packet['truncated'] = True
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = {k: row[k] for k in ('id', 'title', 'url', 'readStatus', 'method', 'error') if k in row}
        item['excerpt'] = str(row.get('text') or row.get('snippet') or '')[:1200]
        packet['result'].append(item)
        if len(encode(packet)) > max_chars:
            packet['result'].pop()
            break
    if len(encode(packet)) > max_chars:
        raise ContextLimit('工具结果摘要超过预算；完整结果已保留')
    return packet
