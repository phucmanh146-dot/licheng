import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8799"


def request(path, method="GET", payload=None, cookie=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    if cookie:
        req.add_header("Cookie", cookie)
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read()), response.headers.get("Set-Cookie")


def test_full_quality_loop(tmp_path):
    env = os.environ.copy()
    env["LICHENG_PORT"] = "8799"
    db = tmp_path / "test.db"
    if db.exists():
        db.unlink()
    env["LICHENG_DB"] = str(db)
    proc = subprocess.Popen(
        [sys.executable, "-m", "app.server"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        for _ in range(30):
            try:
                request("/api/health")
                break
            except (urllib.error.URLError, ConnectionResetError):
                time.sleep(0.1)
        status, body, set_cookie = request(
            "/api/auth/login", "POST", {"email": "li.student@example.com", "password": "quality123"}
        )
        assert status == 200 and set_cookie
        cookie = set_cookie.split(";", 1)[0]
        _, session, _ = request("/api/session", cookie=cookie)
        project = next(item for item in session["projects"] if item["id"] == "xiang")
        pid = project["id"]
        request(f"/api/projects/{pid}/rubric/confirm", "POST", {}, cookie)
        request(f"/api/projects/{pid}/gap/confirm", "POST", {}, cookie)
        request(f"/api/projects/{pid}/actions/start", "POST", {}, cookie)
        request(
            f"/api/projects/{pid}/versions",
            "POST",
            {
                "content": "因为访谈中的物料数量会影响准备，所以样品需要展示物料清单。",
                "reason": "把原话、判断和样品位置连起来。",
            },
            cookie,
        )
        _, _, reviewer_set_cookie = request(
            "/api/auth/login",
            "POST",
            {"email": "chen.teacher@example.com", "password": "review123"},
        )
        reviewer_cookie = reviewer_set_cookie.split(";", 1)[0]
        request(f"/api/projects/{pid}/reviews/start", "POST", {}, reviewer_cookie)
        for index in range(4):
            request(
                f"/api/projects/{pid}/reviews/criteria",
                "POST",
                {"index": index, "value": "pass"},
                reviewer_cookie,
            )
        _, reviewed, _ = request(f"/api/projects/{pid}/reviews/finish", "POST", {}, reviewer_cookie)
        assert reviewed["project"]["review"]["status"] == "成果复核 PASS"
        _, versions, _ = request(f"/api/projects/{pid}/versions", cookie=cookie)
        assert versions["versions"] and versions["versions"][-1]["version"] == 2
        for _ in range(3):
            _, advanced, _ = request(f"/api/projects/{pid}/transfer/advance", "POST", {}, cookie)
        assert advanced["project"]["transfer"]["status"] == "方法已验证"
    finally:
        proc.terminate()
        proc.wait(timeout=5)
