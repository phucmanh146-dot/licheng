import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def request(base, path, method="GET", payload=None, cookie=None, csrf=None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    if csrf:
        headers["X-CSRF-Token"] = csrf
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req) as response:
        body = json.loads(response.read())
        return response.status, body, response.headers.get_all("Set-Cookie") or []


def login(base, email, password):
    status, body, cookies = request(
        base, "/api/auth/login", "POST", {"email": email, "password": password}
    )
    assert status == 200 and body.get("csrfToken")
    jar = {}
    for item in cookies:
        pair = item.split(";", 1)[0]
        if "=" in pair:
            key, value = pair.split("=", 1)
            jar[key] = value
    cookie = "; ".join(f"{key}={value}" for key, value in jar.items())
    return cookie, body["csrfToken"]


def wait_ready(base):
    for _ in range(40):
        try:
            urllib.request.urlopen(base + "/api/health", timeout=1)
            return
        except (urllib.error.URLError, ConnectionResetError):
            time.sleep(0.1)
    raise RuntimeError("server did not start")


def test_full_quality_loop(tmp_path):
    base = "http://127.0.0.1:8799"
    env = os.environ.copy()
    env.update(
        {
            "LICHENG_PORT": "8799",
            "LICHENG_DB": str(tmp_path / "test.db"),
            "LICHENG_DISABLE_DEEPSEEK": "1",
        }
    )
    proc = subprocess.Popen(
        [sys.executable, "-m", "app.server"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        wait_ready(base)
        cookie, csrf = login(base, "li.student@example.com", "quality123")
        _, session, _ = request(base, "/api/session", cookie=cookie)
        assert session["authenticated"]
        project = next(item for item in session["projects"] if item["id"] == "xiang")
        pid = project["id"]

        for action in ("rubric/confirm", "gap/confirm", "actions/start"):
            status, body, _ = request(
                base, f"/api/projects/{pid}/{action}", "POST", {}, cookie, csrf
            )
            assert status == 200 and body.get("project"), (action, status, body)

        status, body, _ = request(
            base,
            f"/api/projects/{pid}/versions",
            "POST",
            {
                "content": "因为访谈中的物料数量会影响准备，所以样品需要展示物料清单。",
                "reason": "把原话、判断和样品位置连起来。",
            },
            cookie,
            csrf,
        )
        assert status == 200 and body["project"]["review"]["versionId"]

        reviewer_cookie, reviewer_csrf = login(
            base, "chen.teacher@example.com", "review123"
        )
        status, body, _ = request(
            base, f"/api/projects/{pid}/reviews/start", "POST", {}, reviewer_cookie, reviewer_csrf
        )
        assert status == 200, (status, body)
        for index in range(4):
            status, body, _ = request(
                base,
                f"/api/projects/{pid}/reviews/criteria",
                "POST",
                {"index": index, "value": "pass"},
                reviewer_cookie,
                reviewer_csrf,
            )
            assert status == 200 and body["project"]["review"]["completed"] == index + 1
        status, reviewed, _ = request(
            base, f"/api/projects/{pid}/reviews/finish", "POST", {}, reviewer_cookie, reviewer_csrf
        )
        assert status == 200 and reviewed["project"]["review"]["status"] == "成果复核 PASS"

        _, versions, _ = request(base, f"/api/projects/{pid}/versions", cookie=cookie)
        assert versions["versions"] and versions["versions"][-1]["version"] == 2
        for _ in range(3):
            status, advanced, _ = request(
                base, f"/api/projects/{pid}/transfer/advance", "POST", {}, cookie, csrf
            )
            assert status == 200
        assert advanced["project"]["transfer"]["status"] == "方法已验证"
    finally:
        proc.terminate()
        proc.wait(timeout=5)
