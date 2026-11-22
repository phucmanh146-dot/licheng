import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8802"


def request(path, method="GET", payload=None, cookie=None, csrf=None, raw=None, content_type=None):
    data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    elif payload is not None:
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    if csrf:
        headers["X-CSRF-Token"] = csrf
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def login(email, password):
    status, body = request("/api/auth/login", "POST", {"email": email, "password": password})
    assert status == 200
    return body["csrfToken"]


def cookies_for(email, password):
    req = urllib.request.Request(
        BASE + "/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as response:
        body = json.loads(response.read())
        jar = {}
        for item in response.headers.get_all("Set-Cookie") or []:
            pair = item.split(";", 1)[0]
            if "=" in pair:
                key, value = pair.split("=", 1)
                jar[key] = value
    return "; ".join(f"{k}={v}" for k, v in jar.items()), body["csrfToken"]


def start_server(tmp_path):
    env = os.environ.copy()
    env.update(
        {
            "LICHENG_PORT": "8802",
            "LICHENG_DB": str(tmp_path / "hardening.db"),
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
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1)
            return proc
        except (urllib.error.URLError, ConnectionResetError):
            time.sleep(0.1)
    raise RuntimeError("server did not start")


def test_csrf_review_permission_upload_and_archive(tmp_path):
    proc = start_server(tmp_path)
    try:
        owner_cookie, owner_csrf = cookies_for("li.student@example.com", "quality123")
        reviewer_cookie, reviewer_csrf = cookies_for("chen.teacher@example.com", "review123")

        status, _ = request(
            "/api/projects/xiang/rubric/confirm", "POST", {}, owner_cookie
        )
        assert status == 403  # missing CSRF (authenticated, but forbidden)

        boundary = "----HardeningBoundary"
        forged = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="sourceType"\r\n\r\nfile\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake.pdf"\r\n'
            "Content-Type: application/pdf\r\n\r\n"
        ).encode() + b"not really a pdf" + f"\r\n--{boundary}--\r\n".encode()
        status, body = request(
            "/api/projects/xiang/materials",
            "POST",
            cookie=owner_cookie,
            csrf=owner_csrf,
            raw=forged,
            content_type=f"multipart/form-data; boundary={boundary}",
        )
        assert status == 400 and "文件类型" in body["error"]

        status, created = request(
            "/api/projects/xiang/materials",
            "POST",
            {"sourceType": "text", "name": "证据文本", "text": "用户需要提前准备物料。"},
            owner_cookie,
            owner_csrf,
        )
        assert status == 201
        material_id = created["material"]["id"]
        status, _ = request(
            f"/api/materials/{material_id}/evidence",
            "POST",
            {"excerpt": "提前准备物料", "location": "第 1 段"},
            reviewer_cookie,
            reviewer_csrf,
        )
        assert status == 403  # reviewer cannot write evidence

        status, _ = request("/api/projects/xiang", "DELETE", None, owner_cookie, owner_csrf)
        assert status == 200
        status, body = request("/api/projects/xiang/materials", cookie=owner_cookie)
        assert status == 404 and body.get("code") == "not_found"  # archived blocks subresources

        status, body = request(
            "/api/agent/retrieve",
            "POST",
            {
                "query": "跑不通官方例子，报 TypeError",
                "profile": {"level": 0.3},
                "trace": True,
            },
            owner_cookie,
            owner_csrf,
        )
        assert status == 200 and body["results"][0]["docId"] == "D8"
        assert body["trace"]["routes"]["bm25Query"]
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        memory_file = ROOT / "data" / "retrieval_memory.json"
        if memory_file.exists():
            memory_file.unlink()


def test_v2_resubmission_resets_review(tmp_path):
    proc = start_server(tmp_path)
    env_note = None
    try:
        owner_cookie, owner_csrf = cookies_for("li.student@example.com", "quality123")
        reviewer_cookie, reviewer_csrf = cookies_for("chen.teacher@example.com", "review123")
        pid = "xiang"
        for action in ("rubric/confirm", "gap/confirm", "actions/start"):
            status, body = request(
                f"/api/projects/{pid}/{action}", "POST", {}, owner_cookie, owner_csrf
            )
            assert status == 200, (action, status, body)
        for _ in range(2):
            status, body = request(
                f"/api/projects/{pid}/versions",
                "POST",
                {"content": "因为访谈里的物料数量会影响准备，所以样品要展示清单。", "reason": "有原话支撑。"},
                owner_cookie,
                owner_csrf,
            )
            assert status == 200
            if _ == 1:
                assert all(v == "pending" for v in body["project"]["review"]["criteria"])
                break
            status, body = request(
                f"/api/projects/{pid}/reviews/start", "POST", {}, reviewer_cookie, reviewer_csrf
            )
            assert status == 200, (status, body)
            for index in range(4):
                status, body = request(
                    f"/api/projects/{pid}/reviews/criteria",
                    "POST",
                    {"index": index, "value": "pass"},
                    reviewer_cookie,
                    reviewer_csrf,
                )
                assert status == 200, (index, status, body)
            status, body = request(
                f"/api/projects/{pid}/reviews/finish", "POST", {}, reviewer_cookie, reviewer_csrf
            )
            assert status == 200, (status, body)
            status, body = request(
                f"/api/projects/{pid}/actions/start", "POST", {}, owner_cookie, owner_csrf
            )
            assert status == 200
        status, body = request(
            f"/api/projects/{pid}/reviews/finish", "POST", {}, reviewer_cookie, reviewer_csrf
        )
        assert status == 400 and "先开始复核" in body["error"]
    finally:
        proc.terminate()
        proc.wait(timeout=5)
