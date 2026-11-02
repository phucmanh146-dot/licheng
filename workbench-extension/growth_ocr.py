"""Local OCR of an explicitly supplied image; never captures the desktop."""
import base64
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

from rescue_service import RescueError

LOCK = threading.Lock()


def read_frame(image):
    if os.name != 'nt':
        raise RescueError('此电脑未提供 Windows 本机文字识别。', 'OCR_UNAVAILABLE', 503)
    if not isinstance(image, str) or len(image) > 7_000_000:
        raise RescueError('画面过大，请缩小图片或共享窗口后重试。', 'BAD_FRAME', 400)
    if not image.startswith(('data:image/png;base64,', 'data:image/jpeg;base64,')):
        raise RescueError('需要 PNG 或 JPG 画面。', 'BAD_FRAME', 400)
    try:
        from PIL import Image
        raw = base64.b64decode(image.split(',', 1)[1], validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if not (16 <= im.width <= 4096 and 16 <= im.height <= 4096 and im.width * im.height <= 10_000_000):
                raise ValueError('dimensions')
            im.load()
            out = io.BytesIO()
            im.convert('RGB').save(out, format='PNG')
            raw = out.getvalue()
    except Exception:
        raise RescueError('画面文件无效或尺寸超出范围。', 'BAD_FRAME', 400) from None
    if not LOCK.acquire(blocking=False):
        raise RescueError('本机正在识别上一张画面，请稍后重试。', 'OCR_BUSY', 409)
    try:
        temporary_root = Path(__file__).resolve().parent / '.growth-tmp'
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='shanganya-ocr-', dir=temporary_root) as folder:
            path = Path(folder) / 'frame.png'
            path.write_bytes(raw)
            try:
                result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-File',
                    str(Path(__file__).with_suffix('.ps1')), str(path)], capture_output=True,
                    timeout=22, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            except subprocess.TimeoutExpired:
                raise RescueError('本机文字识别超过22秒，已停止本次读取。', 'OCR_TIMEOUT', 504) from None
            if result.returncode:
                raise RescueError('Windows 未完成本机文字识别，请检查系统中文识别组件或脚本执行权限。', 'OCR_UNAVAILABLE', 503)
            try:
                doc = json.loads(result.stdout.decode('utf-8-sig'))
                if not isinstance(doc.get('lines'), list): raise ValueError('lines')
            except (ValueError, UnicodeError, AttributeError):
                raise RescueError('本机识别未返回有效文字。', 'OCR_UNAVAILABLE', 503) from None
        # Temporary input is deleted before returning; no image database is kept.
        return doc
    finally:
        LOCK.release()
