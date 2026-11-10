import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8800"


def request(path, method="GET", payload=None, cookie=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read()), response.headers.get("Set-Cookie")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read()), error.headers.get("Set-Cookie")


def upload_text(path, cookie):
    boundary = "----LichengTestBoundary"
    content = b"Interview evidence: user needs an earlier materials checklist."
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="sourceType"\r\n\r\nfile\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="record.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
        ).encode()
        + content
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Cookie": cookie},
    )
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read())


def stream_chat(path, payload, cookie):
    data = json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Cookie": cookie,
        },
    )
    with urllib.request.urlopen(req) as response:
        return response.status, response.headers, response.read().decode("utf-8")


def stream_chat_attachment(path, cookie):
    boundary = "----LichengChatAttachment"
    content = "访谈记录：用户需要提前准备物料。".encode("utf-8")
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="projectId"\r\n\r\nxiang\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\n请分析这个文件\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
        ).encode()
        + content
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "text/event-stream",
            "Cookie": cookie,
        },
    )
    with urllib.request.urlopen(req) as response:
        return response.status, response.headers, response.read().decode("utf-8")


def test_materials_rubric_members_and_logout(tmp_path):
    env = os.environ.copy()
    env["LICHENG_PORT"] = "8800"
    env["LICHENG_DB"] = str(tmp_path / "features.db")
    process = subprocess.Popen(
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
        _, _, set_cookie = request(
            "/api/auth/login",
            "POST",
            {"email": "li.student@example.com", "password": "quality123"},
        )
        cookie = set_cookie.split(";", 1)[0]
        status, uploaded = upload_text("/api/projects/xiang/materials", cookie)
        assert status == 201 and uploaded["material"]["originalName"] == "record.txt"
        status, created, _ = request(
            "/api/projects/xiang/materials",
            "POST",
            {"sourceType": "text", "name": "实验记录", "text": "访谈原文：用户希望提前准备物料。"},
            cookie,
        )
        assert status == 201
        material_id = created["material"]["id"]
        status, evidence, _ = request(
            f"/api/materials/{material_id}/evidence",
            "POST",
            {"excerpt": "用户希望提前准备物料。", "location": "第 1 段"},
            cookie,
        )
        assert status == 201 and evidence["evidenceId"]
        status, rubric, _ = request(
            "/api/projects/xiang/rubric",
            "POST",
            {
                "title": "实验记录判断标准",
                "scope": "原文 → 结论",
                "items": [{"id": "trace", "label": "能回查原文", "requirement": "保留位置"}],
            },
            cookie,
        )
        assert status == 201 and rubric["version"] == 2
        status, project_response, _ = request("/api/projects/xiang", cookie=cookie)
        assert status == 200 and project_response["project"]["rubricConfirmed"] is False
        status, members, _ = request("/api/projects/xiang/members", cookie=cookie)
        assert status == 200 and any(item["role"] == "reviewer" for item in members["members"])
        owner_id = next(item["user_id"] for item in members["members"] if item["role"] == "owner")
        status, assigned, _ = request(
            "/api/projects/xiang/actions",
            "POST",
            {"index": 0, "memberId": owner_id},
            cookie,
        )
        assert status == 200 and assigned["project"]["actions"][0]["assigneeId"] == owner_id
        status, audit, _ = request("/api/projects/xiang/audit", cookie=cookie)
        assert status == 200 and audit["events"]
        status, advice, _ = request(
            "/api/agent/advice",
            "POST",
            {"projectId": "xiang", "workspace": "materials"},
            cookie,
        )
        assert (
            status == 200
            and advice["provider"] == "local-rules"
            and advice["basis"]["projectId"] == "xiang"
        )
        status, help_card, _ = request(
            "/api/projects/xiang/help",
            "POST",
            {"message": "需要确认机构授权", "category": "环境"},
            cookie,
        )
        assert status == 201 and help_card["status"] == "open"
        status, _, logout_cookie = request("/api/auth/logout", "POST", {}, cookie)
        assert status == 200 and "Max-Age=0" in logout_cookie
        status, _, _ = request("/api/projects/xiang", cookie=cookie)
        assert status == 401
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_agent_chat_stream_falls_back_without_key(tmp_path):
    env = os.environ.copy()
    env.update({"LICHENG_PORT": "8801", "LICHENG_DB": str(tmp_path / "stream.db"), "LICHENG_DISABLE_DEEPSEEK": "1"})
    process = subprocess.Popen(
        [sys.executable, "-m", "app.server"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        for _ in range(30):
            try:
                urllib.request.urlopen("http://127.0.0.1:8801/api/health", timeout=1)
                break
            except (urllib.error.URLError, ConnectionResetError):
                time.sleep(0.1)
        login = urllib.request.Request(
            "http://127.0.0.1:8801/api/auth/login",
            data=json.dumps({"email": "li.student@example.com", "password": "quality123"}).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(login) as response:
            cookie = response.headers.get("Set-Cookie").split(";", 1)[0]
        original_base = globals()["BASE"]
        globals()["BASE"] = "http://127.0.0.1:8801"
        try:
            status, headers, raw = stream_chat(
                "/api/projects/xiang/agent/chat/stream",
                {"projectId": "xiang", "message": "请告诉我下一步怎么做"},
                cookie,
            )
            assert status == 200
            assert headers.get_content_type() == "text/event-stream"
            assert '"status": "thinking"' in raw
            assert raw.count('"type": "token"') >= 2
            assert '"type": "done"' in raw
            assert "sk-" not in raw
            status, headers, attachment_raw = stream_chat_attachment(
                "/api/projects/xiang/agent/chat/stream", cookie
            )
        finally:
            globals()["BASE"] = original_base
        assert status == 200 and headers.get_content_type() == "text/event-stream"
        assert '"type": "done"' in attachment_raw
    finally:
        process.terminate()
        process.wait(timeout=5)

