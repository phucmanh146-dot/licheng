"""涓婂哺楦?Autoloop: append-only event ledger and zero-cost durable checkpoints."""
from __future__ import annotations
import json, os, re, sqlite3, time, uuid
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOME = Path(os.environ.get("SHANGANYA_AUTOLOOP_HOME") or os.environ.get("SHANGANYA_SESSION_HOME") or os.environ.get("SHANGANYA_ACCOUNT_DATA_DIR") or str(ROOT / ".cloud-data"))
DB_PATH = Path(os.environ.get("SHANGANYA_AUTOLOOP_DB", str(HOME / "autoloop.sqlite3")))
MAX_PAYLOAD = 1_000_000
MAX_HOPS = 8
ALLOWED_EVENTS = {
    "plan.snapshot", "material.detected", "schedule.imported",
    "interruption.created", "interruption.resumed", "interruption.resolved",
    "schedule.replanned", "task.paused", "task.resumed", "task.completed",
    "checkpoint.saved", "agent.suspended", "agent.woken"
}

class AutoloopError(ValueError):
    pass

def _account(value):
    value = str(value or "default").strip()
    if not value or len(value) > 160 or not re.fullmatch(r"[A-Za-z0-9_.:@-]+", value):
        raise AutoloopError("璐﹀彿鏍囪瘑鏃犳晥")
    return value

def _validate_hop(payload):
    payload = payload if isinstance(payload, dict) else {}
    hop = payload.get("hop", 0)
    if isinstance(hop, bool) or not isinstance(hop, int) or hop < 0 or hop > MAX_HOPS:
        raise AutoloopError("Agent ???? 8 ?????? hop ???")

def _json(value):
    raw = json.dumps(value if isinstance(value, (dict, list)) else {}, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > MAX_PAYLOAD:
        raise AutoloopError("浜嬩欢鍐呭杩囧ぇ锛岃鍒嗘壒淇濆瓨")
    return raw

def _db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("""CREATE TABLE IF NOT EXISTS autoloop_events(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at REAL NOT NULL,
        UNIQUE(account_id,event_id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS autoloop_checkpoints(
        account_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        updated_at REAL NOT NULL,
        PRIMARY KEY(account_id,task_id)
    )""")
    conn.execute("""CREATE TRIGGER IF NOT EXISTS autoloop_events_no_update
        BEFORE UPDATE ON autoloop_events BEGIN SELECT RAISE(ABORT,'append-only ledger'); END""")
    conn.execute("""CREATE TRIGGER IF NOT EXISTS autoloop_events_no_delete
        BEFORE DELETE ON autoloop_events BEGIN SELECT RAISE(ABORT,'append-only ledger'); END""")
    return conn

def append_event(data):
    data = data if isinstance(data, dict) else {}
    account = _account(data.get("accountId"))
    event_id = str(data.get("eventId") or "").strip()
    kind = str(data.get("eventType") or "").strip()
    if not event_id or len(event_id) > 180:
        raise AutoloopError("缂哄皯鏈夋晥浜嬩欢缂栧彿")
    if kind not in ALLOWED_EVENTS:
        raise AutoloopError("涓嶆敮鎸佺殑浜嬩欢绫诲瀷")
    payload_data = data.get("payload") or {}
    _validate_hop(payload_data)
    payload = _json(payload_data)
    now = time.time()
    with closing(_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.execute("INSERT OR IGNORE INTO autoloop_events(account_id,event_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)",
                           (account,event_id,kind,payload,now))
        row = conn.execute("SELECT seq,event_id,event_type,payload_json,created_at FROM autoloop_events WHERE account_id=? AND event_id=?",
                           (account,event_id)).fetchone()
        conn.commit()
        return {"ok": True, "duplicate": cur.rowcount == 0, "event": _event_row(row)}

def _event_row(row):
    if not row: return None
    return {"seq": row["seq"], "eventId": row["event_id"] if "event_id" in row.keys() else "", "eventType": row["event_type"], "payload": json.loads(row["payload_json"]),
            "createdAt": row["created_at"]}

def save_checkpoint(data):
    data = data if isinstance(data, dict) else {}
    account = _account(data.get("accountId"))
    task_id = str(data.get("taskId") or "daily-plan").strip()[:180]
    if not task_id: raise AutoloopError("妫€鏌ョ偣缂哄皯浠诲姟缂栧彿")
    snapshot = _json(data.get("snapshot") or {})
    expected = data.get("expectedRevision")
    now = time.time()
    with closing(_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision FROM autoloop_checkpoints WHERE account_id=? AND task_id=?", (account,task_id)).fetchone()
        revision = int(row["revision"]) if row else 0
        if expected is not None and int(expected) != revision:
            conn.rollback()
            return {"ok": False, "conflict": True, "revision": revision}
        revision += 1
        conn.execute("""INSERT INTO autoloop_checkpoints(account_id,task_id,revision,snapshot_json,updated_at)
            VALUES(?,?,?,?,?) ON CONFLICT(account_id,task_id) DO UPDATE SET
            revision=excluded.revision,snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at""",
            (account,task_id,revision,snapshot,now))
        event_id = str(data.get("eventId") or ("checkpoint:" + task_id + ":" + str(revision)))
        conn.execute("INSERT OR IGNORE INTO autoloop_events(account_id,event_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)",
                     (account,event_id,"checkpoint.saved",_json({"taskId":task_id,"revision":revision}),now))
        conn.commit()
        return {"ok": True, "taskId": task_id, "revision": revision, "updatedAt": now}

def interrupt(data):
    data = data if isinstance(data, dict) else {}
    account = _account(data.get("accountId"))
    event_id = str(data.get("eventId") or "").strip()
    if not event_id: raise AutoloopError("涓柇浜嬩欢缂哄皯缂栧彿")
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    snapshot = _json(data.get("snapshot") or {})
    now = time.time()
    task_id = str(data.get("taskId") or "daily-plan").strip()[:180] or "daily-plan"
    with closing(_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute("SELECT seq,event_id,event_type,payload_json,created_at FROM autoloop_events WHERE account_id=? AND event_id=?",
                                (account,event_id)).fetchone()
        if existing:
            row = conn.execute("SELECT revision FROM autoloop_checkpoints WHERE account_id=? AND task_id=?", (account,task_id)).fetchone()
            conn.commit()
            return {"ok": True, "duplicate": True, "revision": int(row["revision"]) if row else 0, "event": _event_row(existing)}
        row = conn.execute("SELECT revision FROM autoloop_checkpoints WHERE account_id=? AND task_id=?", (account,task_id)).fetchone()
        revision = (int(row["revision"]) if row else 0) + 1
        conn.execute("""INSERT INTO autoloop_checkpoints(account_id,task_id,revision,snapshot_json,updated_at)
            VALUES(?,?,?,?,?) ON CONFLICT(account_id,task_id) DO UPDATE SET
            revision=excluded.revision,snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at""",
            (account,task_id,revision,snapshot,now))
        full_payload = dict(payload)
        full_payload.update({"eventId":event_id,"taskId":task_id,"checkpointRevision":revision})
        _validate_hop(full_payload)
        conn.execute("INSERT INTO autoloop_events(account_id,event_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)",
                     (account,event_id,"interruption.created",_json(full_payload),now))
        conn.commit()
        return {"ok": True, "duplicate": False, "revision": revision, "eventId": event_id}

def resume(data):
    data = data if isinstance(data, dict) else {}
    account = _account(data.get("accountId"))
    task_id = str(data.get("taskId") or "daily-plan").strip()[:180] or "daily-plan"
    event_id = str(data.get("eventId") or "").strip()
    if not event_id: raise AutoloopError("鎭㈠浜嬩欢缂哄皯缂栧彿")
    with closing(_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision,snapshot_json,updated_at FROM autoloop_checkpoints WHERE account_id=? AND task_id=?", (account,task_id)).fetchone()
        if not row:
            conn.rollback()
            return {"ok": False, "missing": True}
        payload = {"taskId":task_id,"interruptionEventId":str(data.get("interruptionEventId") or ""),
                   "revision":int(row["revision"]),"note":str(data.get("note") or "")[:1000]}
        conn.execute("INSERT OR IGNORE INTO autoloop_events(account_id,event_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)",
                     (account,event_id,"interruption.resumed",_json(payload),time.time()))
        conn.commit()
        return {"ok": True, "revision": int(row["revision"]), "snapshot": json.loads(row["snapshot_json"]),
                "updatedAt": row["updated_at"]}

def get_state(account_id="default", after=0, limit=80):
    account = _account(account_id)
    after = max(0, int(after or 0)); limit = max(1,min(int(limit or 80),200))
    with closing(_db()) as conn:
        cp = conn.execute("SELECT task_id,revision,snapshot_json,updated_at FROM autoloop_checkpoints WHERE account_id=? ORDER BY updated_at DESC LIMIT 1",
                          (account,)).fetchone()
        rows = conn.execute("SELECT seq,event_id,event_type,payload_json,created_at FROM autoloop_events WHERE account_id=? AND seq>? ORDER BY seq ASC LIMIT ?",
                            (account,after,limit)).fetchall()
        recent = conn.execute("SELECT seq,event_id,event_type,payload_json,created_at FROM autoloop_events WHERE account_id=? AND event_type IN ('interruption.created','interruption.resumed','interruption.resolved') ORDER BY seq ASC",
                              (account,)).fetchall()
        last_seq = conn.execute("SELECT COALESCE(MAX(seq),0) FROM autoloop_events WHERE account_id=?", (account,)).fetchone()[0]
    created = {}
    resolved = set()
    for row in recent:
        event = _event_row(row); payload = event["payload"]
        if event["eventType"] == "interruption.created": created[payload.get("eventId") or event["eventId"]] = event
        elif event["eventType"] in ("interruption.resumed","interruption.resolved"):
            ref = payload.get("interruptionEventId")
            if ref: resolved.add(ref)
    pending = [event for event_id,event in created.items() if event_id and event_id not in resolved]
    return {"ok":True,"checkpoint":None if not cp else {"taskId":cp["task_id"],"revision":cp["revision"],
            "snapshot":json.loads(cp["snapshot_json"]),"updatedAt":cp["updated_at"]},
            "events":[_event_row(r) for r in rows],"pendingInterruptions":pending,
            "lastSeq":last_seq}


