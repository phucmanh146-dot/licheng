"""本机能力：直接读 Obsidian 库 + 截屏识别文字。

之所以放在服务端而不是浏览器里：
- 浏览器的 File System Access API 每次都要用户手动选文件夹、而且授权会掉；
  服务端跑在同一台机器上，可以直接读库目录，点一下就通。
- 微信没有对外接口，读不到聊天数据库；能自动化的只能是「截图 → OCR」这一步。
"""
import os
import subprocess
import tempfile
from pathlib import Path

TEXT_EXT = {'.md', '.txt', '.csv', '.srt', '.vtt'}
MAX_FILES = 800
MAX_FILE_BYTES = 1024 * 1024


def _from_env_file(key):
    path = Path.home() / '.hermes' / '.env'
    if not path.is_file():
        return ''
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        name, sep, value = line.partition('=')
        if sep and name.strip() == key:
            value = value.strip()
            if len(value) > 1 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            return value
    return ''


def vault_root():
    raw = (os.environ.get('FOCUS_VAULT_PATH') or _from_env_file('OBSIDIAN_VAULT_PATH') or '').strip()
    if not raw:
        return None
    path = Path(raw).expanduser()
    return path if path.is_dir() else None


def _safe(root, relative):
    target = (root / str(relative).lstrip('/\\')).resolve()
    root = root.resolve()
    if root != target and root not in target.parents:
        raise ValueError('路径不在知识库内。')
    return target


def _scan(root):
    docs, skipped = [], 0
    for path in sorted(root.rglob('*')):
        if len(docs) >= MAX_FILES:
            break
        if not path.is_file() or path.suffix.lower() not in TEXT_EXT:
            continue
        if any(part.startswith('.') for part in path.relative_to(root).parts):
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                skipped += 1
                continue
            docs.append(path)
        except OSError:
            continue
    return docs, skipped


def vault_info():
    root = vault_root()
    if not root:
        return {'connected': False, 'path': '', 'name': '', 'count': 0,
                'note': '没有找到本机知识库目录。可以在 ~/.hermes/.env 里设置 OBSIDIAN_VAULT_PATH。'}
    docs, skipped = _scan(root)
    return {'connected': True, 'path': str(root), 'name': root.name, 'count': len(docs),
            'truncated': len(docs) >= MAX_FILES, 'skipped': skipped,
            'note': '直接读取本机库（只读）：%d 篇文本资料。' % len(docs)}


def vault_list(limit=200, with_text=False):
    root = vault_root()
    if not root:
        return vault_info()
    docs, skipped = _scan(root)
    items = []
    for path in docs[:max(1, min(800, int(limit)))]:
        try:
            row = {'path': str(path.relative_to(root)).replace('\\', '/'),
                   'title': path.stem, 'size': path.stat().st_size}
            if with_text:
                row['text'] = path.read_text(encoding='utf-8', errors='replace')[:MAX_FILE_BYTES]
            items.append(row)
        except OSError:
            continue
    return {'connected': True, 'name': root.name, 'path': str(root), 'count': len(docs),
            'truncated': len(docs) >= MAX_FILES, 'skipped': skipped, 'files': items}


def vault_search(query, limit=12):
    root = vault_root()
    if not root:
        return {'connected': False, 'results': [], 'note': vault_info()['note']}
    needle = str(query or '').strip().lower()
    if not needle:
        return {'connected': True, 'results': [], 'note': '请输入要检索的关键词。'}
    docs, _ = _scan(root)
    hits = []
    for path in docs:
        try:
            text = path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        lowered = text.lower()
        index = lowered.find(needle)
        if index < 0 and needle not in path.stem.lower():
            continue
        if index < 0:
            index = 0
        start = max(0, index - 80)
        hits.append({'path': str(path.relative_to(root)).replace('\\', '/'), 'title': path.stem,
                     'snippet': text[start:start + 260].strip(), 'chars': len(text)})
        if len(hits) >= max(1, min(40, int(limit))):
            break
    return {'connected': True, 'name': root.name, 'query': query, 'results': hits,
            'note': '在「%s」中匹配到 %d 篇。' % (root.name, len(hits))}


def vault_read(relative, limit=20000):
    root = vault_root()
    if not root:
        raise ValueError('还没有连接本机知识库。')
    target = _safe(root, relative)
    if not target.is_file():
        raise ValueError('找不到这篇笔记。')
    text = target.read_text(encoding='utf-8', errors='replace')
    return {'path': str(relative), 'title': target.stem, 'text': text[:max(1, int(limit))],
            'chars': len(text), 'truncated': len(text) > limit}


def vault_save(title, text):
    """只在库内新建 FocusQuest/ 笔记，绝不覆盖已有文件。"""
    root = vault_root()
    if not root:
        raise ValueError('还没有连接本机知识库。')
    safe_name = ''.join(ch for ch in str(title or '') if ch not in '\\/:*?"<>|').strip()[:80] or '上岸鸭笔记'
    folder = root / 'FocusQuest'
    folder.mkdir(exist_ok=True)
    target = folder / (safe_name + '.md')
    index = 1
    while target.exists():
        target = folder / ('%s-%d.md' % (safe_name, index))
        index += 1
    target.write_text(str(text or ''), encoding='utf-8')
    return {'ok': True, 'path': str(target.relative_to(root)).replace('\\', '/'), 'name': target.name}


SHOT_SCRIPT = (
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;"
    "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;"
    "$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height);"
    "$g=[System.Drawing.Graphics]::FromImage($bmp);"
    "$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);"
    "$bmp.Save($env:SY_SHOT_PATH,[System.Drawing.Imaging.ImageFormat]::Png);"
    "$g.Dispose();$bmp.Dispose();"
)


def screenshot_bytes():
    """抓一张主屏截图。只有用户点按钮时才会执行。"""
    if os.name != 'nt':
        raise ValueError('截屏识别只在 Windows 上可用。')
    with tempfile.TemporaryDirectory(prefix='sy-shot-') as folder:
        target = Path(folder) / 'screen.png'
        env = dict(os.environ, SY_SHOT_PATH=str(target))
        try:
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', SHOT_SCRIPT],
                           env=env, capture_output=True, timeout=45, check=True)
        except (OSError, subprocess.SubprocessError) as exc:
            raise ValueError('截屏没有成功，请检查屏幕录制权限。') from exc
        if not target.is_file():
            raise ValueError('截屏没有生成图片。')
        return target.read_bytes()


def screen_ocr():
    from source_support import image_text
    raw = screenshot_bytes()
    text, note = image_text(raw)
    return {'title': '屏幕截图', 'text': text, 'chars': len(text), 'ocr': True,
            'note': note + ' 这是主屏整屏截图，只在本机识别，不会上传到任何服务器。'}
