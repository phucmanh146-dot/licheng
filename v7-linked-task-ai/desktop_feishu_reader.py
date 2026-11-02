"""Read Feishu pages through the user's visible, already-authenticated browser session.

This intentionally uses page selection + clipboard only. It never reads browser cookies,
passwords, local storage, or authentication tokens. It is triggered only by an explicit UI action.
"""
import os
import re
import threading
import time
from urllib.parse import urlparse

_LOCK = threading.Lock()
_ALLOWED_HOSTS = ("feishu.cn", "larksuite.com")


def validate_feishu_url(url):
    value = str(url or "").strip()
    p = urlparse(value)
    if p.scheme != "https" or not p.hostname:
        raise ValueError("请输入 HTTPS 飞书 Wiki/文档链接。")
    host = p.hostname.lower()
    if not any(host == root or host.endswith("." + root) for root in _ALLOWED_HOSTS):
        raise ValueError("仅允许读取 feishu.cn 或 larksuite.com 的链接。")
    if not (p.path.startswith("/wiki/") or p.path.startswith("/docx/")):
        raise ValueError("目前支持飞书 Wiki 和新版云文档链接。")
    if p.username or p.password:
        raise ValueError("链接中不能包含用户名或密码。")
    return value


def read_feishu_via_browser(url):
    value = validate_feishu_url(url)
    try:
        import pyautogui
        import pyperclip
    except Exception as exc:
        raise RuntimeError("缺少本机浏览器自动化依赖，请先检查 pyautogui/pyperclip。") from exc
    with _LOCK:
        old_clipboard = None
        captured = ""
        try:
            old_clipboard = pyperclip.paste()
            # Open the target visibly in the user's default browser; existing login remains browser-managed.
            os.startfile(value)
            time.sleep(5)
            # Explicitly focus the visible Feishu browser window; desktop agents can otherwise retain focus.
            try:
                import win32gui
                import win32con
                candidates = []
                def collect(hwnd, _):
                    if win32gui.IsWindowVisible(hwnd):
                        title = win32gui.GetWindowText(hwnd)
                        if title and ("飞书" in title or "Feishu" in title or "Lark" in title):
                            candidates.append((hwnd, title))
                win32gui.EnumWindows(collect, None)
                if candidates:
                    target = next((h for h, t in candidates if "Google Chrome" in t and "for Testing" not in t), candidates[0][0])
                    win32gui.ShowWindow(target, win32con.SW_RESTORE)
                    try:
                        win32gui.SetForegroundWindow(target)
                    except Exception:
                        from pywinauto import Application
                        Application(backend="uia").connect(handle=target).top_window().set_focus()
                    time.sleep(1)
            except Exception:
                pass
            pyautogui.hotkey("ctrl", "l")
            pyperclip.copy(value)
            pyautogui.hotkey("ctrl", "v")
            pyautogui.press("enter")
            time.sleep(12)
            # Refocus the Feishu tab/window after navigation, then copy only visible page text.
            try:
                candidates = []
                win32gui.EnumWindows(collect, None)
                if candidates:
                    target = next((h for h, t in candidates if "Google Chrome" in t and "for Testing" not in t), candidates[0][0])
                    win32gui.ShowWindow(target, win32con.SW_RESTORE)
                    try:
                        win32gui.SetForegroundWindow(target)
                    except Exception:
                        from pywinauto import Application
                        Application(backend="uia").connect(handle=target).top_window().set_focus()
                    time.sleep(0.7)
            except Exception:
                pass
            for _ in range(3):
                pyautogui.hotkey("ctrl", "a")
                time.sleep(0.35)
                pyautogui.hotkey("ctrl", "c")
                time.sleep(1.0)
                candidate = pyperclip.paste()
                if isinstance(candidate, str) and len(candidate.strip()) > 250:
                    captured = candidate.strip()
                    break
                time.sleep(2)
            if len(captured) < 250:
                raise RuntimeError("浏览器未复制到足够的正文。请确认飞书已登录、文档有权限且页面加载完成后重试。")
            low = captured[:2500].lower()
            if len(captured) < 1500 and any(s in captured for s in ("登录后查看", "请登录飞书", "扫码登录", "无权访问")):
                raise RuntimeError("当前浏览器会话没有显示文档正文，请先在浏览器中完成登录或申请文档权限。")
            lines = [re.sub(r"\s+", " ", line).strip() for line in captured.splitlines()]
            lines = [line for line in lines if line]
            title = (lines[0] if lines else "飞书文档")[:180]
            if title.lower() in ("feishu", "lark", "飞书"):
                title = (lines[1] if len(lines) > 1 else "飞书文档")[:180]
            return {
                "ok": True,
                "readStatus": "fulltext",
                "method": "visible-authenticated-browser",
                "title": title,
                "url": value,
                "text": captured[:250000],
                "chars": len(captured),
                "note": "通过已登录浏览器可见正文读取；没有读取或导出 Cookie、密码或登录令牌。"
            }
        finally:
            if isinstance(old_clipboard, str):
                try:
                    pyperclip.copy(old_clipboard)
                except Exception:
                    pass
