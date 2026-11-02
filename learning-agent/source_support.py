"""Source normalization, heading extraction and local OCR."""
import re
import shutil
import os
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse


def normalize_url(value):
    value = str(value or '').strip().replace('\\_', '_')
    # A copied Feishu token may have a line-wrap/space inside it.
    value = re.sub(r'((?:https?://)?[\w.-]+\.(?:feishu.cn|larksuite.com)/(?:wiki|docx)/)([A-Za-z0-9\s]+)(?=[?#\]）)]|$)', lambda m: m[1] + re.sub(r'\s+', '', m[2]), value)
    match = re.search(r'(?:https?://|obsidian://)[^\s<>\]）]+|(?:[\w-]+\.)+[a-zA-Z]{2,}/[^\s<>\]）]*', value)
    value = match[0].rstrip(').,，。；;') if match else value
    if value and not re.match(r'^[a-zA-Z][\w+.-]*://', value):
        value = 'https://' + value
    return value


def feishu_outline(blocks, doc_token, source_url):
    by_id = {x.get('block_id'): x for x in blocks}
    ordered, seen = [], set()
    def visit(block):
        bid = block.get('block_id')
        if bid in seen:
            return
        seen.add(bid)
        ordered.append(block)
        for child in block.get('children', []):
            if child in by_id:
                visit(by_id[child])
    roots = [b for b in blocks if b.get('block_type') == 1 or b.get('block_id') == doc_token]
    for block in roots or blocks:
        visit(block)
    # All document blocks are already ordered when a page block isn't returned.
    outline, lines, heading_level, current = [], [], 1, None
    for block in ordered:
        kind = next((key for key in block if re.fullmatch(r'heading[1-9]|text|bullet|ordered|code|quote|todo', key)), None)
        if not kind:
            continue
        data = block.get(kind) or {}
        parts, links = [], []
        for item in data.get('elements', []):
            run = item.get('text_run', {})
            parts.append(run.get('content', '') or item.get('equation', {}).get('content', ''))
            target = run.get('text_element_style', {}).get('link', {}).get('url', '')
            if target.startswith(('http://', 'https://')):
                links.append(target)
        text = ''.join(parts).strip()
        if not text:
            continue
        level = 0
        if kind.startswith('heading'):
            level = heading_level = int(kind[-1])
        elif kind in ('bullet', 'ordered'):
            depth, parent, ancestors = 1, block.get('parent_id'), set()
            while parent in by_id and parent not in ancestors:
                ancestors.add(parent)
                ancestor = by_id[parent]
                if ancestor.get('block_type') in (12, 13):
                    depth += 1
                parent = ancestor.get('parent_id')
            level = min(12, heading_level + depth)
        if level:
            current = {'title': text, 'level': level, 'kind': 'heading' if kind.startswith('heading') else 'list',
                       'text': '', 'url': links[0] if links else '',
                       'originUrl': source_url, 'blockId': block.get('block_id', '')}
            outline.append(current)
            lines.append('#' * min(6, level) + ' ' + text)
        else:
            lines.append(text)
            if current is not None:
                current['text'] += text + '\n'
    return '\n\n'.join(lines), outline


def image_text(raw):
    from rescue_service import RescueError
    try:
        from PIL import Image, ImageOps
        import pytesseract
        executable = shutil.which('tesseract')
        if not executable and os.name == 'nt':
            candidate = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Tesseract-OCR' / 'tesseract.exe'
            if candidate.is_file():
                executable = str(candidate)
        if not executable:
            raise RescueError('本机缺少图片文字识别组件。图片仍可预览；可复制文字或安装 Tesseract 后重试。', 'OCR_UNAVAILABLE', 422)
        pytesseract.pytesseract.tesseract_cmd = executable
        image = Image.open(BytesIO(raw))
        if image.width * image.height > 30_000_000:
            raise RescueError('图片像素过大，请缩小到 3000 万像素以内。', 'IMAGE_TOO_LARGE', 413)
        image = ImageOps.exif_transpose(image).convert('RGB')
        data_dir = Path(__file__).resolve().parent / '.ocr-data'
        # 语言包目录通过 TESSDATA_PREFIX 传入。不要用 --tessdata-dir "路径"：
        # Windows 下 tesseract 会把引号当成路径的一部分，导致所有语言包都加载失败
        # （表现为 OCR_UNREADABLE，无论图片多清晰都识别不出来）。
        if any((data_dir / (lang + '.traineddata')).is_file() for lang in ('chi_sim', 'eng')):
            os.environ['TESSDATA_PREFIX'] = str(data_dir)
        languages = pytesseract.get_languages()
        selected = '+'.join(x for x in ('chi_sim', 'eng') if x in languages)
        if not selected:
            raise RescueError('图片识别语言包未安装。请安装中文或英文语言包。', 'OCR_UNAVAILABLE', 422)
        text = pytesseract.image_to_string(image, lang=selected, config='--psm 3', timeout=45).strip()
        return text, '本机 OCR；识别文字请核对。' + ('未安装中文语言包，中文可能不完整。' if 'chi_sim' not in languages else '')
    except RescueError:
        raise
    except Exception as exc:
        raise RescueError('图片文字没有识别成功，请使用更清晰的截图或粘贴正文。', 'OCR_UNREADABLE', 422) from exc


def legacy_doc_text(raw):
    from rescue_service import RescueError
    if os.name != 'nt':
        raise RescueError('旧版 .doc 请先在 Word 另存为 .docx 后导入。', 'DOC_CONVERSION_REQUIRED', 422)
    # Read through installed Microsoft Word in protected view, with macros disabled.
    with tempfile.TemporaryDirectory(prefix='sy-doc-') as folder:
        source = Path(folder) / 'input.doc'
        target = Path(folder) / 'output.txt'
        source.write_bytes(raw)
        script = "$ErrorActionPreference='Stop'; $w=$null; $pv=$null; try { $w=New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0; $w.AutomationSecurity=3; $pv=$w.ProtectedViewWindows.Open($env:SY_DOC_SOURCE); [IO.File]::WriteAllText($env:SY_DOC_TARGET,$pv.Document.Content.Text,[Text.UTF8Encoding]::new($false)) } finally { if($pv){$pv.Close()}; if($w){$w.Quit()} }"
        env = dict(os.environ, SY_DOC_SOURCE=str(source), SY_DOC_TARGET=str(target))
        try:
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], env=env, capture_output=True, timeout=45, check=True)
            return target.read_text(encoding='utf-8')
        except (OSError, subprocess.SubprocessError) as exc:
            raise RescueError('旧版 Word 未能读取。请用 Word 另存为 .docx 后导入。', 'DOC_CONVERSION_REQUIRED', 422) from exc
