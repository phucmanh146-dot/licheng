"""Bounded public subtitle extraction, including Bilibili's inline SRT."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.request import Request, build_opener


def subtitle_text(raw, extension=''):
    from rescue_service import _subtitle_text
    if extension in ('json', 'json3') or raw.lstrip().startswith('{'):
        obj = json.loads(raw)
        if isinstance(obj.get('body'), list):
            return '\n'.join(str(row.get('content', '')) for row in obj['body']).strip()
        return '\n'.join(''.join(s.get('utf8', '') for s in row.get('segs', []))
                         for row in obj.get('events', [])).strip()
    if extension in ('ttml', 'srv1', 'srv2', 'srv3', 'xml'):
        import xml.etree.ElementTree as ET
        tree = ET.fromstring(raw)
        return '\n'.join(''.join(e.itertext()) for e in tree.iter()
                         if e.tag.rsplit('}', 1)[-1] in ('p', 'text')).strip()
    return _subtitle_text(raw)


def error_code(message):
    if re.search(r'fresh cookies|log(?:ged)?[ -]?in|sign in|captcha|verification|verify|HTTP Error (?:401|403|412|429)', message, re.I):
        return 'SOURCE_REQUIRES_LOGIN'
    return 'VIDEO_UNAVAILABLE'


def inspect_video(url):
    import yt_dlp
    import rescue_service as rescue
    rescue.validate_url(url)
    class Logger:
        def debug(self, _): pass
        def warning(self, _): pass
        def error(self, _): pass
    options = {'quiet': True, 'no_warnings': True, 'logger': Logger(), 'noplaylist': True,
               'skip_download': True, 'writesubtitles': True, 'writeautomaticsub': True,
               'subtitleslangs': ['all', '-danmaku'], 'socket_timeout': 10,
               'retries': 0, 'extractor_retries': 0, 'fragment_retries': 0}
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        code = error_code(str(exc))
        message = ('视频平台要求有效的浏览器会话、登录或验证；尚未读到字幕。可打开原网页处理后重试，或补充字幕/正文。'
                   if code == 'SOURCE_REQUIRES_LOGIN' else '视频页面暂时无法读取，请确认链接仍有效，或补充该视频的字幕。')
        raise rescue.RescueError(message, code, 422) from None
    if not isinstance(info, dict) or info.get('_type') in ('playlist', 'multi_video'):
        raise rescue.RescueError('这是视频合集，请复制其中每个视频的链接后批量导入。', 'VIDEO_COLLECTION', 422)
    tracks = []
    for automatic, kind in ((False, 'subtitles'), (True, 'automatic_captions')):
        for language, variants in (info.get(kind) or {}).items():
            if language == 'danmaku':
                continue
            language_rank = 0 if 'zh' in language.lower() else 1 if language.lower().startswith(('en', 'ai-en')) else 2
            for track in variants:
                if track.get('ext') in ('srt', 'vtt', 'json3', 'json', 'ttml', 'srv1', 'srv2', 'srv3'):
                    tracks.append((language_rank, automatic, 0 if track.get('data') else 1, language, track))
    tracks.sort(key=lambda row: row[:3])
    transcript, selected, automatic = '', '', False
    for _, auto, _, language, track in tracks[:8]:
        try:
            raw = track.get('data')
            if not raw and track.get('url'):
                source = track['url']
                if source.startswith('//'): source = 'https:' + source
                rescue.validate_url(source)
                request = Request(source, headers={'User-Agent': 'Mozilla/5.0 FocusQuest/2.0'})
                with build_opener(rescue.PublicRedirect()).open(request, timeout=8) as response:
                    raw = response.read(4_000_001)
                    if len(raw) > 4_000_000:
                        continue
                    raw = raw.decode('utf-8-sig')
            if not isinstance(raw, str) or re.search(r'<(?:html|!doctype)\b', raw, re.I):
                continue
            transcript = subtitle_text(raw, track.get('ext', ''))
            if transcript:
                selected, automatic = language, auto
                break
        except (OSError, ValueError, rescue.RescueError):
            continue
    title = str(info.get('title') or url)[:300]
    description = str(info.get('description') or '').strip()[:12000]
    note = ('已读取' + ('平台自动字幕' if automatic else '公开字幕') + '（' + selected + '）。') if transcript else '已读取标题和简介，未取得可读字幕；简介不会作为视频完整内容。'
    return {'title': title, 'text': transcript[:80000] if transcript else description,
            'thin': not bool(transcript), 'transcript': bool(transcript), 'url': url,
            'kind': 'video-transcript' if transcript else 'video-preview', 'note': note,
            'chars': len(transcript or description), 'language': selected}


def extract_video(url):
    from rescue_service import RescueError
    try:
        process = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--url', url],
                                 capture_output=True, text=True, encoding='utf-8', timeout=55,
                                 env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        result = json.loads(process.stdout)
    except subprocess.TimeoutExpired:
        raise RescueError('视频读取超过55秒，已停止本条读取；其他链接继续处理，可以单独重试。', 'VIDEO_TIMEOUT', 504) from None
    except (ValueError, OSError):
        raise RescueError('视频读取组件未返回有效结果，链接仍已保存。', 'VIDEO_UNAVAILABLE', 502) from None
    if result.get('error'):
        raise RescueError(result['error'], result.get('code', 'VIDEO_UNAVAILABLE'), 422)
    return result


if __name__ == '__main__':
    try:
        result = inspect_video(sys.argv[2])
    except Exception as exc:
        from rescue_service import RescueError
        result = {'error': str(exc) if isinstance(exc, RescueError) else '视频读取组件未能完成请求。',
                  'code': getattr(exc, 'code', 'VIDEO_UNAVAILABLE')}
    print(json.dumps(result, ensure_ascii=True))
