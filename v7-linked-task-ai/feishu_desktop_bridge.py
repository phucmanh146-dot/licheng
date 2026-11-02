"""Local-only Feishu document reader using an already logged-in visible Chrome session.

Only invoked on an explicit URL read from the 127.0.0.1 Shanganya desktop server.
Never reads browser cookies, tokens, passwords, Chrome databases, or local Feishu profiles.
"""
from __future__ import annotations
import threading, time, urllib.parse

_LOCK = threading.Lock()

def read_logged_in_feishu(url: str, timeout: float = 18.0) -> dict:
    import os
    import pyautogui as pg
    import pyperclip
    import win32gui, win32con
    from pywinauto import Desktop

    if os.environ.get("FOCUS_ALLOW_LOCAL_AI") != "1" or os.environ.get("SHANGANYA_WORKER_PORT"):
        raise RuntimeError("只允许在用户自己的本机服务上读取已登录飞书页面")
    p = urllib.parse.urlsplit(str(url or "").strip())
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not (host == "feishu.cn" or host.endswith(".feishu.cn") or host == "larksuite.com" or host.endswith(".larksuite.com")):
        raise ValueError("仅支持飞书官方 HTTPS 文档链接")
    if not (p.path.startswith("/wiki/") or p.path.startswith("/docx/") or p.path.startswith("/docs/")):
        raise ValueError("只支持飞书 Wiki、Docx 文档路径")
    if not _LOCK.acquire(blocking=False):
        raise RuntimeError("飞书读取工具正在处理上一条文档，请稍后重试")
    original_clipboard = None
    try:
        original_clipboard = pyperclip.paste()
        windows = []
        def collect(hwnd, out):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if "Chrome" in title or "Edge" in title:
                    out.append((hwnd,title))
        win32gui.EnumWindows(collect, windows)
        candidates = [row for row in windows if "飞书" in row[1]]
        existing_feishu_tab = bool(candidates)
        if not candidates:
            candidates = [row for row in windows if "Google Chrome" in row[1] and "Chrome for Testing" not in row[1]]
        if not candidates:
            raise RuntimeError("没有找到已登录的 Chrome 浏览器，请先在电脑上打开飞书文档")
        hwnd, title = candidates[0]
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        Desktop(backend="win32").window(handle=hwnd).set_focus()
        time.sleep(0.45)
        if win32gui.GetForegroundWindow() != hwnd:
            raise RuntimeError("无法切换到飞书文档窗口，请在桌面上打开飞书文档后重试")
        # Open a fresh tab if the current Chrome tab is not a Feishu document.
        # This avoids replacing the user's unrelated ChatGPT or work tabs.
        pg.hotkey("ctrl","l" if existing_feishu_tab else "t")
        time.sleep(0.25)
        pg.write(url, interval=0.003)
        pg.press("enter")
        time.sleep(min(10.0, max(3.0,timeout/2)))
        # The browser can lose focus while the document loads; re-focus it before copying.
        Desktop(backend='win32').window(handle=hwnd).set_focus()
        time.sleep(0.35)
        if win32gui.GetForegroundWindow()!=hwnd:
            raise RuntimeError("浏览器焦点被其他窗口占用，请停止使用鼠标后重试")
        # Confirm the active document URL before copying anything. Without this
        # check the shortcut could accidentally copy an unrelated website.
        pg.hotkey("ctrl","l")
        time.sleep(0.2)
        pg.hotkey("ctrl","c")
        time.sleep(0.4)
        active_url = pyperclip.paste()
        pg.press("esc")
        active = urllib.parse.urlsplit(active_url if isinstance(active_url,str) else "")
        if active.scheme != "https" or active.hostname != p.hostname or active.path.rstrip("/") != p.path.rstrip("/"):
            raise RuntimeError("浏览器未停留在请求的飞书文档，已取消复制以防误读取其他页面")
        win32gui.GetWindowRect(hwnd)
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        # Focus only the document body. Feishu read-only document allows Ctrl+A/C.
        center_x = int(left + (right-left) * .36)
        center_y = int(top + (bottom-top) * .48)
        pg.click(center_x, center_y)
        time.sleep(0.3)
        pg.hotkey("ctrl","a")
        time.sleep(0.25)
        pg.hotkey("ctrl","c")
        time.sleep(0.9)
        copied = pyperclip.paste()
        copied = copied if isinstance(copied,str) else ""
        if len(copied.strip()) < 100 or "npx @wonderwhy-er/desktop-commander" in copied:
            raise RuntimeError("文档未能从已登录浏览器复制；可能需要登录、文档无权限或禁止复制")
        if any(phrase in copied[:240] for phrase in ("扫码登录","立即登录","登录飞书以继续","访问权限不足")):
            raise RuntimeError("飞书文档需要重新登录或授予访问权限")
        body = copied.strip()[:100000]
        return {
            "title": title.split(" - ")[0].strip() or "飞书文档",
            "url": urllib.parse.urlunsplit((p.scheme,p.netloc,p.path,p.query,"")),
            "text": body, "content": body, "chars": len(body),
            "source": "已登录电脑的飞书浏览器", "sourceKind": "feishu_desktop",
            "readStatus": "visible-copy", "thin": False,
            "partial": True, "truncated": len(copied.strip()) > len(body),
            "note": "已从当前浏览器的可选中文本实际读取。图片只显示为占位符，子页面和目录没有证明已完整读取。点击原文链接可返回飞书。",
            "links": [{"title":"返回飞书原文","url":url,"type":"source"}],
        }
    finally:
        if isinstance(original_clipboard,str):
            try: pyperclip.copy(original_clipboard)
            except Exception: pass
        _LOCK.release()


def cached_user_document(url: str) -> dict | None:
    """Last successfully copied snapshot of the *exact* user-supplied Feishu page.
    Not live, not a general-purpose fallback, and not evidence of full Wiki traversal.
    """
    from pathlib import Path
    from datetime import datetime, timezone
    p=urllib.parse.urlsplit(str(url or ""))
    if p.scheme!="https" or not ((p.hostname or "").endswith(".feishu.cn") or (p.hostname or "")=="feishu.cn"):
        return None
    if p.path.rstrip("/")!="/wiki/YD6HwHCS5iXlgmkpLOoccnvon7b":
        return None
    snapshot=Path(__file__).with_name("_feishu_desktop_probe.txt")
    if not snapshot.is_file():
        return None
    body=snapshot.read_text(encoding="utf-8").strip()
    if len(body)<400 or "npx @wonderwhy-er/desktop-commander" in body:
        return None
    sampled_at=datetime.fromtimestamp(snapshot.stat().st_mtime,timezone.utc).isoformat(timespec="seconds")
    return {"title":"上岸鸭技术改进", "url":urllib.parse.urlunsplit((p.scheme,p.netloc,p.path,p.query,"")),
        "text":body,"content":body,"chars":len(body),"source":"已登录浏览器上次复制的文档文字",
        "sourceKind":"feishu-local-snapshot","readStatus":"snapshot","thin":False,
        "partial":True,"truncated":False,"capturedAt":sampled_at,
        "note":"这是 "+sampled_at+" 保存的文档正文快照，不是实时读取；不包含图片和整个飞书目录。点击来源可打开原文。",
        "links":[{"title":"飞书原文","url":url,"type":"source"}]}
