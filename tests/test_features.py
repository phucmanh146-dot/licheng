import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def request(base, path, method="GET", payload=None, cookie=None, csrf=None, raw=None, content_type=None):
    if raw is not None:
        data = raw
    else:
        data = json.dumps(payload).encode() if payload is not None else None
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    elif payload is not None:
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    if csrf:
        headers["X-CSRF-Token"] = csrf
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            content = response.read()
            return response.status, safe_json(content), response.headers.get_all("Set-Cookie") or [], content
    except urllib.error.HTTPError as error:
        content = error.read()
        return error.code, safe_json(content), error.headers.get_all("Set-Cookie") or [], content


def safe_json(content):
    try:
        return json.loads(content)
    except (ValueError, TypeError):
        return {}


def login(base, email, password):
    status, body, cookies, _ = request(
        base, "/api/auth/login", "POST", {"email": email, "password": password}
    )
    assert status == 200 and body.get("csrfToken")
    jar = {}
    for item in cookies:
        pair = item.split(";", 1)[0]
        if "=" in pair:
            key, value = pair.split("=", 1)
            jar[key] = value
    return "; ".join(f"{key}={value}" for key, value in jar.items()), body["csrfToken"]


def wait_ready(base):
    for _ in range(40):
        try:
            urllib.request.urlopen(base + "/api/health", timeout=1)
            return
        except (urllib.error.URLError, ConnectionResetError):
            time.sleep(0.1)
    raise RuntimeError("server did not start")


def multipart(fields, file_field=None, filename=None, content=b""):
    boundary = "----LichengTestBoundary"
    parts = []
    for key, value in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        )
    if file_field:
        parts.append(
            (
                f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
                "Content-Type: text/plain\r\n\r\n"
            ).encode()
        )
        parts.append(content)
        parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def start_server(tmp_path, port, db_name, extra=None):
    base = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.update({"LICHENG_PORT": str(port), "LICHENG_DB": str(tmp_path / db_name)})
    env.update(extra or {})
    process = subprocess.Popen(
        [sys.executable, "-m", "app.server"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_ready(base)
    return base, process


def stop_server(process):
    process.terminate()
    process.wait(timeout=5)


def test_materials_rubric_members_and_logout(tmp_path):
    base, process = start_server(tmp_path, 8800, "features.db", {"LICHENG_DISABLE_DEEPSEEK": "1"})
    try:
        cookie, csrf = login(base, "li.student@example.com", "quality123")
        raw, content_type = multipart(
            {"sourceType": "file"}, "file", "record.txt", b"Interview evidence: checklist."
        )
        status, uploaded, _, _ = request(
            base,
            "/api/projects/xiang/materials",
            "POST",
            cookie=cookie,
            csrf=csrf,
            raw=raw,
            content_type=content_type,
        )
        assert status == 201 and uploaded["material"]["originalName"] == "record.txt"

        status, created, _, _ = request(
            base,
            "/api/projects/xiang/materials",
            "POST",
            {"sourceType": "text", "name": "实验记录", "text": "访谈原文：用户希望提前准备物料。"},
            cookie,
            csrf,
        )
        assert status == 201
        material_id = created["material"]["id"]
        status, evidence, _, _ = request(
            base,
            f"/api/materials/{material_id}/evidence",
            "POST",
            {"excerpt": "用户希望提前准备物料。", "location": "第 1 段"},
            cookie,
            csrf,
        )
        assert status == 201 and evidence["evidenceId"]
        status, rubric, _, _ = request(
            base,
            "/api/projects/xiang/rubric",
            "POST",
            {
                "title": "实验记录判断标准",
                "scope": "原文 → 结论",
                "items": [{"id": "trace", "label": "能回查原文", "requirement": "保留位置"}],
            },
            cookie,
            csrf,
        )
        assert status == 201 and rubric["version"] == 2
        status, members, _, _ = request(base, "/api/projects/xiang/members", cookie=cookie)
        assert status == 200 and any(item["role"] == "reviewer" for item in members["members"])
        owner_id = next(item["user_id"] for item in members["members"] if item["role"] == "owner")
        status, assigned, _, _ = request(
            base,
            "/api/projects/xiang/actions",
            "POST",
            {"index": 0, "memberId": owner_id},
            cookie,
            csrf,
        )
        assert status == 200 and assigned["project"]["actions"][0]["assigneeId"] == owner_id
        status, advice, _, _ = request(
            base,
            "/api/agent/advice",
            "POST",
            {"projectId": "xiang", "workspace": "materials"},
            cookie,
            csrf,
        )
        assert status == 200 and advice["provider"] == "local-rules"
        status, help_card, _, _ = request(
            base,
            "/api/projects/xiang/help",
            "POST",
            {"message": "需要确认机构授权", "category": "环境"},
            cookie,
            csrf,
        )
        assert status == 201 and help_card["status"] == "open"
        status, _, cookies, _ = request(
            base, "/api/auth/logout", "POST", {}, cookie, csrf
        )
        assert status == 200 and any("Max-Age=0" in item for item in cookies)
        status, _, _, _ = request(base, "/api/projects/xiang", cookie=cookie)
        assert status == 401
    finally:
        stop_server(process)


def test_agent_chat_stream_falls_back_without_key(tmp_path):
    base, process = start_server(
        tmp_path, 8801, "stream.db", {"LICHENG_DISABLE_DEEPSEEK": "1"}
    )
    try:
        cookie, csrf = login(base, "li.student@example.com", "quality123")
        status, _, _, raw = request(
            base,
            "/api/projects/xiang/agent/chat/stream",
            "POST",
            {"projectId": "xiang", "message": "请告诉我下一步怎么做"},
            cookie,
            csrf,
        )
        assert status == 200
        assert b'"status": "thinking"' in raw
        assert raw.count(b'"type": "token"') >= 2
        assert b'"type": "done"' in raw
        assert b"sk-" not in raw

        raw_form, content_type = multipart(
            {"projectId": "xiang", "message": "请分析这个文件"},
            "file",
            "note.txt",
            "访谈记录：用户需要提前准备物料。".encode("utf-8"),
        )
        status, _, _, attachment_raw = request(
            base,
            "/api/projects/xiang/agent/chat/stream",
            "POST",
            cookie=cookie,
            csrf=csrf,
            raw=raw_form,
            content_type=content_type,
        )
        assert status == 200 and b'"type": "done"' in attachment_raw
    finally:
        stop_server(process)
