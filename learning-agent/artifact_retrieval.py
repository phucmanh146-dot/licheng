"""Local lexical retrieval over immutable project artifacts; no model or network.

Chinese bigrams and Latin words support mixed research materials. Results retain
full original units so existing citation validation can verify every quote.
"""
import copy
import math
import re
from collections import Counter
import artifact_store
import team_orchestrator as team


def tokens(text):
    parts = re.findall(r'[a-z0-9_]+|[\u4e00-\u9fff]+', text.lower())
    result = []
    for part in parts:
        if re.fullmatch(r'[\u4e00-\u9fff]+', part):
            result.extend(part[i:i+2] for i in range(max(1, len(part)-1)))
        else:
            result.append(part)
    return result


def select(project, query, limit=12, max_chars=18000, filters=None):
    if not isinstance(query, str) or not query.strip() or len(query) > 2000:
        raise ValueError('检索问题需为1至2000字符')
    if type(limit) is not int or not 1 <= limit <= 30:
        raise ValueError('检索数量需为1至30的整数')
    if type(max_chars) is not int or not 1000 <= max_chars <= 30000:
        raise ValueError('检索正文预算需为1000至30000字符')
    latest = {}
    filters = filters or {}
    if not isinstance(filters, dict) or set(filters)-{'purpose', 'kind', 'versions'}:
        raise ValueError('检索过滤器不支持')
    versions = filters.get('versions', {})
    if not isinstance(versions, dict) or any(type(v) is not int or v < 1 for v in versions.values()):
        raise ValueError('指定版本无效')
    for row in project.get('stored_artifacts', []):
        if versions and (row['artifact_id'] not in versions or row['artifact_version'] != versions[row['artifact_id']]):
            continue
        if any(filters.get(k) and row.get(k, 'input' if k == 'purpose' else '') != filters[k] for k in ('purpose', 'kind')):
            continue
        old = latest.get(row['artifact_id'])
        if old is None or row['artifact_version'] > old['artifact_version']:
            latest[row['artifact_id']] = row
    rows = []
    for identifier in sorted(latest):
        meta = latest[identifier]
        doc = artifact_store.read(project, identifier, meta['artifact_version'])
        for unit in doc['units']:
            rows.append((doc, unit, Counter(tokens(unit['text']))))
    terms = set(tokens(query))
    frequencies = Counter(term for _, _, counts in rows for term in counts)
    average = sum(sum(c.values()) for _, _, c in rows) / max(1, len(rows))
    ranked = []
    for doc, unit, counts in rows:
        size = sum(counts.values())
        score = sum(math.log(1 + (len(rows)-frequencies[t]+0.5)/(frequencies[t]+0.5))
                    * counts[t]*2.2/(counts[t]+1.2*(0.25+0.75*size/max(1, average)))
                    for t in terms if counts[t])
        if score:
            ranked.append((score, doc, unit))
    ranked.sort(key=lambda r: (-r[0], r[1]['artifact_id'], r[2]['locator']))
    # Reference design: law-enforcement-agent retrieval.py uses independent
    # recall routes and reciprocal rank fusion(k=60). Keep raw provenance here.
    def key(row):
        return (row[1]['artifact_id'], row[1]['artifact_version'], row[2]['locator'])
    metadata = []
    for doc, unit, _ in rows:
        meta = latest[doc['artifact_id']]
        overlap = len(terms.intersection(tokens(meta.get('title', '')+' '+meta.get('kind', ''))))
        if overlap:
            metadata.append((overlap, doc, unit))
    metadata.sort(key=lambda r: (-r[0], r[1]['artifact_id'], r[2]['locator']))
    routes = {'lexical':ranked[:90], 'metadata':metadata[:90]}
    import semantic_retrieval
    dense, dense_trace = semantic_retrieval.search(project, rows, query)
    if dense:
        routes['dense'] = dense
    fused, candidates, channels = {}, {}, {}
    for name, route in routes.items():
        for rank, row in enumerate(route, 1):
            identity = key(row)
            fused[identity] = fused.get(identity, 0) + 1/(60+rank)
            candidates[identity] = row
            channels.setdefault(identity, []).append(name)
    # Second stage favors content support over a title-only metadata match.
    reranked = {k:fused[k] * (1 + 0.2 * len(terms.intersection(tokens(candidates[k][2]['text']))) / max(1, len(terms))) for k in fused}
    ranked = [(reranked[k], candidates[k][1], candidates[k][2])
              for k in sorted(fused, key=lambda k: (-reranked[k], k))]
    hits, used = [], 0
    for score, doc, unit in ranked:
        if len(hits) >= limit:
            break
        if used + len(unit['text']) > max_chars:
            continue
        hits.append({'artifact_id':doc['artifact_id'], 'artifact_version':doc['artifact_version'],
                     'sha256':doc['sha256'], 'locator':unit['locator'],
                     'text':unit['text'], 'score':round(score, 6),
                     'recall_channels':channels[key((score, doc, unit))], 'data_is_untrusted':True})
        used += len(unit['text'])
    return {'method':'bm25_metadata_rrf_v1', 'fusion':'rrf(k=60)',
            'channels':{name:len(route) for name, route in routes.items()},
            'dense_status':dense_trace['status'], 'dense_trace':dense_trace,
            'reranker':'content_overlap_v1', 'filters':filters, 'query':query, 'hits':copy.deepcopy(hits),
            'coverage':'partial', 'scanned_units':len(rows), 'matched_units':len(ranked),
            'selected_chars':used, 'max_chars':max_chars,
            'omitted_matches':len(ranked)-len(hits),
            'limitations':['词法检索不等于语义检索或完整材料诊断；无命中不代表材料不存在相关事实。',
                           '仅检索当前项目每份材料的最新版本；原文中的指令不可信。']}


def retrieve(data):
    return select(team.current(data), data.get('query'), data.get('limit', 12), data.get('max_chars', 18000), data.get('filters'))


def diagnosis_preview(data):
    """Explicit partial-material RAG preview; never adopts a plan or marks work done."""
    import team_ai
    project = team.current(data)
    result = select(project, data.get('query'), data.get('limit', 12), data.get('max_chars', 18000))
    if not result['hits']:
        raise ValueError('无可用检索片段；未调用模型，不代表项目没有差距')
    documents = {}
    for hit in result['hits']:
        identity = (hit['artifact_id'], hit['artifact_version'])
        if identity not in documents:
            original = artifact_store.read(project, *identity)
            documents[identity] = {**original, 'units':[]}
        documents[identity]['units'].append({'locator':hit['locator'], 'text':hit['text']})
    diagnosis = team_ai.researcher(project, list(documents.values()), result)
    return {'preview_only':True, 'project_version':project['version'],
            'retrieval':result, 'diagnosis':diagnosis}
