"""Bound source context around the user's question, retaining source provenance."""
import re


def question_excerpt(content, question, limit):
    if len(content) <= limit: return content
    terms = set(re.findall(r'[a-zA-Z0-9]{2,}', question.lower()))
    for segment in re.findall(r'[\u4e00-\u9fff]+', question):
        terms.update(segment[i:i + 2] for i in range(len(segment) - 1))
    if not terms: return content[:limit]
    size = min(700, max(120, limit // 3))
    chunks = [(i, content[i:i + size]) for i in range(0, len(content), size)]
    ranked = sorted(chunks, key=lambda pair: (-sum(term in pair[1].lower() for term in terms), pair[0]))
    selected, budget = [], max(1, limit - 40)
    for index, chunk in ranked:
        if budget < 30: break
        part = chunk[:max(1, budget - 20)]
        selected.append((index, '[原文位置 ' + str(index + 1) + ']\n' + part))
        budget -= len(selected[-1][1]) + 2
    return '\n\n'.join(value for _, value in sorted(selected))[:limit]
