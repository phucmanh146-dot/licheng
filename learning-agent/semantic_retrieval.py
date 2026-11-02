"""Real Ollama embeddings and Qdrant retrieval; explicitly unavailable otherwise."""
import hashlib
import json
import math
import os
import uuid
from functools import lru_cache


def settings():
    return {'model':os.getenv('SHANGAN_EMBEDDING_MODEL', 'bge-m3'),
            'dimensions':int(os.getenv('SHANGAN_EMBEDDING_DIMENSIONS', '1024')),
            'base':os.getenv('SHANGAN_OLLAMA_URL', ''),
            'collection':os.getenv('SHANGAN_QDRANT_COLLECTION', 'shangan_artifacts_v1')}


def embed(texts):
    import httpx
    cfg = settings()
    if not cfg['base']:
        raise RuntimeError('EMBEDDING_NOT_CONFIGURED')
    vectors = []
    for offset in range(0, len(texts), 16):
        batch = texts[offset:offset+16]
        with httpx.Client(timeout=60, trust_env=False) as client:
            response = client.post(cfg['base'].rstrip('/')+'/api/embed',
                                   json={'model':cfg['model'], 'input':batch, 'truncate':False})
            response.raise_for_status()
        current = response.json().get('embeddings', [])
        if len(current) != len(batch):
            raise ValueError('EMBEDDING_COUNT_MISMATCH')
        for vector in current:
            if len(vector) != cfg['dimensions'] or any(not math.isfinite(x) for x in vector) or not any(vector):
                raise ValueError('EMBEDDING_DIMENSION_OR_VALUES_INVALID')
        vectors.extend(current)
    return vectors


@lru_cache
def client():
    from qdrant_client import QdrantClient
    if os.getenv('SHANGAN_QDRANT_PATH'):
        return QdrantClient(path=os.environ['SHANGAN_QDRANT_PATH'])
    if not os.getenv('SHANGAN_QDRANT_URL'):
        raise RuntimeError('QDRANT_NOT_CONFIGURED')
    return QdrantClient(url=os.environ['SHANGAN_QDRANT_URL'],
                        api_key=os.getenv('SHANGAN_QDRANT_API_KEY') or None, timeout=15)


def identity(project, doc, unit, start):
    cfg = settings()
    value = [project['project_id'], doc['artifact_id'], doc['artifact_version'], doc['sha256'],
             unit['locator'], start, cfg['model'], cfg['dimensions']]
    return str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(value, ensure_ascii=False)))


def search(project, rows, query, limit=90):
    cfg = settings()
    if not cfg['base'] or not (os.getenv('SHANGAN_QDRANT_URL') or os.getenv('SHANGAN_QDRANT_PATH')):
        return [], {'status':'NOT_CONFIGURED', 'model':cfg['model']}
    from qdrant_client import models as m
    try:
        allowed = {(d['artifact_id'], d['artifact_version'], d['sha256'], u['locator']):(d, u) for d, u, _ in rows}
        cache_key = 'shangan:rag:'+hashlib.sha256(json.dumps([project['project_id'],query,cfg,sorted(allowed)],sort_keys=True).encode()).hexdigest()
        cached = cache_get(cache_key)
        if cached is not None:
            restored = []
            for entry in cached:
                key = tuple(entry['key'])
                if key in allowed:
                    doc, unit = allowed[key]
                    restored.append((entry['score'],doc,unit))
            return restored, {'status':'AVAILABLE','model':cfg['model'],'cache_hit':True}
        db = client()
        if not db.collection_exists(cfg['collection']):
            try:
                db.create_collection(cfg['collection'], vectors_config=m.VectorParams(size=cfg['dimensions'], distance=m.Distance.COSINE))
            except Exception:
                if not db.collection_exists(cfg['collection']):
                    raise
        chunks = []
        for doc, unit, _ in rows:
            for start in range(0, len(unit['text']), 1000):
                chunks.append((identity(project, doc, unit, start), doc, unit, start))
        # Inspect IDs in bounded batches; existing vectors are immutable and reusable.
        missing = []
        for offset in range(0, len(chunks), 128):
            batch = chunks[offset:offset+128]
            known = {str(p.id) for p in db.retrieve(cfg['collection'], [x[0] for x in batch], with_payload=False)}
            missing.extend(x for x in batch if x[0] not in known)
        for offset in range(0, len(missing), 16):
            batch = missing[offset:offset+16]
            vectors = embed([u['text'][s:s+1200] for _, _, u, s in batch])
            points = [m.PointStruct(id=pid, vector=vector, payload={
                'project_id':project['project_id'], 'artifact_id':doc['artifact_id'],
                'artifact_version':doc['artifact_version'], 'sha256':doc['sha256'],
                'locator':unit['locator'], 'start':start, 'embedding_model':cfg['model']})
                for (pid, doc, unit, start), vector in zip(batch, vectors)]
            db.upsert(cfg['collection'], points, wait=True)
        vector = embed([query])[0]
        hits = db.query_points(cfg['collection'], query=vector, limit=min(300, limit*3),
            query_filter=m.Filter(must=[m.FieldCondition(key='project_id', match=m.MatchValue(value=project['project_id'])),
                m.FieldCondition(key='embedding_model', match=m.MatchValue(value=cfg['model']))]),
            score_threshold=0.2, with_payload=True).points
        # Authorization and current-version filtering is checked again against actual bytes.
        allowed = {(d['artifact_id'], d['artifact_version'], d['sha256'], u['locator']):(d, u) for d, u, _ in rows}
        found, seen = [], set()
        for hit in hits:
            p = hit.payload
            key = (p['artifact_id'], p['artifact_version'], p['sha256'], p['locator'])
            if key in allowed and key not in seen:
                doc, unit = allowed[key]
                found.append((float(hit.score), doc, unit)); seen.add(key)
        cache_set(cache_key,[{'key':[d['artifact_id'],d['artifact_version'],d['sha256'],u['locator']],'score':score} for score,d,u in found[:limit]])
        return found[:limit], {'status':'AVAILABLE', 'model':cfg['model'],
                              'dimensions':cfg['dimensions'], 'indexed_chunks':len(chunks)}
    except Exception as exc:
        # Only the error class is exposed; connection errors can contain credentials.
        return [], {'status':'UNAVAILABLE', 'error_code':type(exc).__name__, 'model':cfg['model']}


def cache_get(key):
    if not os.getenv('SHANGAN_REDIS_URL'):
        return None
    try:
        import redis
        raw = redis.Redis.from_url(os.environ['SHANGAN_REDIS_URL'], socket_connect_timeout=1, socket_timeout=1).get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cache_set(key, value):
    if not os.getenv('SHANGAN_REDIS_URL'):
        return
    try:
        import redis
        redis.Redis.from_url(os.environ['SHANGAN_REDIS_URL'], socket_connect_timeout=1, socket_timeout=1).setex(key, 120, json.dumps(value))
    except Exception:
        pass  # PostgreSQL/source bytes remain authoritative.
