"""Backend quality gates: observability, optimistic locking and reviewer isolation."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8807"


def request(path, method="GET", payload=None, cookie=None, csrf=None, headers=None):
    data = json.dumps(payload).encode() if payload is not None else None
    all_headers = {"Content-Type": "application/json"}
    if cookie:
        all_headers["Cookie"] = cookie
    if csrf:
        all_headers["X-CSRF-Token"] = csrf
    all_headers.update(headers or {})
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=all_headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read()), response.headers
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read()), error.headers


def login(email, password):
    status, body, headers = request(
        "/api/auth/login", "POST", {"email": email, "password": password}
    )
    assert status == 200, (status, body)
    jar = {}
    for item in headers.get_all("Set-Cookie") or []:
        pair = item.split(";", 1)[0]
        if "=" in pair:
            key, value = pair.split("=", 1)
            jar[key] = value
    return "; ".join(f"{k}={v}" for k, v in jar.items()), body["csrfToken"]


def start_server(tmp_path):
    env = os.environ.copy()
    env.update(
        {
            "LICHENG_PORT": "8807",
            "LICHENG_DB": str(tmp_path / "quality.db"),
            "LICHENG_DISABLE_DEEPSEEK": "1",
        }
    )
    proc = subprocess.Popen(
        [sys.executable, "-m", "app.server"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=None,
    )
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1)
            return proc
        except (urllib.error.URLError, ConnectionResetError, urllib.error.HTTPError):
            time.sleep(0.1)
    proc.terminate()
    proc.wait(timeout=5)
    raise RuntimeError("server did not start")


def test_health_errors_and_request_ids(tmp_path):
    proc = start_server(tmp_path)
    try:
        status, body, headers = request("/api/health")
        assert status == 200
        assert body["ok"] is True and body["service"] == "licheng"
        assert body["db"] == "ok" and body["version"] == "0.2.0"
        assert body["uptimeSeconds"] >= 0
        assert headers.get("X-Request-Id")

        status, body, headers = request("/api/this-endpoint-does-not-exist")
        assert status == 404 and body["code"] == "not_found"
        assert headers.get("X-Request-Id")

        cookie, csrf = login("li.student@example.com", "quality123")
        status, body, _ = request("/api/auth/logout", "POST", {}, cookie=cookie)
        assert status == 403 and body["code"] == "forbidden"  # CSRF now required on logout
        status, body, _ = request("/api/auth/logout", "POST", {}, cookie, csrf)
        assert status == 200
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_optimistic_lock_rejects_stale_revision(tmp_path):
    proc = start_server(tmp_path)
    try:
        cookie, csrf = login("li.student@example.com", "quality123")
        status, body, _ = request("/api/projects/xiang", cookie=cookie)
        assert status == 200
        revision = body["project"]["revision"]

        status, body, _ = request(
            "/api/projects/xiang",
            "PATCH",
            {"name": "改名失败"},
            cookie,
            csrf,
            headers={"If-Match": "999"},
        )
        assert status == 409 and body["code"] == "conflict"

        status, body, _ = request(
            "/api/projects/xiang",
            "PATCH",
            {"name": "改名成功"},
            cookie,
            csrf,
            headers={"If-Match": str(revision)},
        )
        assert status == 200
        assert body["project"]["revision"] == revision + 1
        assert body["project"]["name"] == "改名成功"
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_reviewer_judgements_are_isolated(tmp_path):
    proc = start_server(tmp_path)
    try:
        owner_cookie, owner_csrf = login("li.student@example.com", "quality123")
        for action in ("rubric/confirm", "gap/confirm", "actions/start", "versions"):
            payload = {
                "content": "把物料清单写进活动准备模块，便于现场核对。",
                "reason": "原话中提到了提前知道物料数量的影响。",
            } if action == "versions" else {}
            status, body, _ = request(
                f"/api/projects/xiang/{action}", "POST", payload, owner_cookie, owner_csrf
            )
            assert status == 200, (action, status, body)

        first_cookie, first_csrf = login("chen.teacher@example.com", "review123")
        status, _, _ = request(
            "/api/projects/xiang/reviews/start", "POST", {}, first_cookie, first_csrf
        )
        assert status == 200
        for index in range(4):
            value = "fail" if index == 0 else "pass"
            status, body, _ = request(
                "/api/projects/xiang/reviews/criteria",
                "POST",
                {"index": index, "value": value},
                first_cookie,
                first_csrf,
            )
            assert status == 200, (status, body)
        status, body, _ = request(
            "/api/projects/xiang/reviews/finish", "POST", {}, first_cookie, first_csrf
        )
        assert status == 400  # a failing reviewer must not pass the gate

        status, invitation, _ = request(
            "/api/projects/xiang/members/invitations",
            "POST",
            {"email": "second.reviewer@example.com", "role": "reviewer"},
            owner_cookie,
            owner_csrf,
        )
        assert status == 201
        # register the invited account first
        status, _, _ = request(
            "/api/auth/register",
            "POST",
            {
                "name": "第二复核者",
                "email": "second.reviewer@example.com",
                "password": "review123",
            },
        )
        assert status == 200
        second_cookie, second_csrf = login("second.reviewer@example.com", "review123")
        status, body, _ = request(
            f"/api/invitations/{invitation['token']}/accept",
            "POST",
            {},
            second_cookie,
            second_csrf,
        )
        assert status == 200, (status, body)

        status, _, _ = request(
            "/api/projects/xiang/reviews/start", "POST", {}, second_cookie, second_csrf
        )
        assert status == 200
        for index in range(4):
            status, body, _ = request(
                "/api/projects/xiang/reviews/criteria",
                "POST",
                {"index": index, "value": "pass"},
                second_cookie,
                second_csrf,
            )
            assert status == 200, (status, body)
        status, body, _ = request(
            "/api/projects/xiang/reviews/finish", "POST", {}, second_cookie, second_csrf
        )
        assert status == 200, (status, body)
        assert body["project"]["review"]["status"] == "成果复核 PASS"

        # The first reviewer still cannot finish: its own fail is authoritative.
        status, body, _ = request(
            "/api/projects/xiang/reviews/finish", "POST", {}, first_cookie, first_csrf
        )
        assert status == 400
    finally:
        proc.terminate()
        proc.wait(timeout=5)
