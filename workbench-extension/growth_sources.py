"""Read provided public links; a preview is never a video transcript."""
import base64
import html
import re
from pathlib import PurePosixPath
from urllib.parse import urlsplit, unquote
from urllib.request import Request, build_opener


def is_video_link(url):
    import rescue_service as rescue
    parsed = urlsplit(url)
    host = (parsed.hostname or '').lower()
    if host == 'bilibili.com' or host.endswith('.bilibili.com'):
        return parsed.path.startswith(('/video/', '/festival/', '/bangumi/play/'))
    return rescue.is_video_url(url) or host in ('www.iesdouyin.com', 'iesdouyin.com', 'bili2233.cn')


def links_in(value):
    result = []
    for url in re.findall(r'https?://[^\s<>"\'，。；！？、（）【】]+', html.unescape(str(value or ''))):
        url = url.rstrip('.,;:!?')
        while url.endswith((')', ']')) and (url.count(')') > url.count('(') or url.count(']') > url.count('[')):
            url = url[:-1]
        if url not in result:
            result.append(url)
    return result


def read_url(value):
    import rescue_service as rescue
    url = rescue.normalize_url(value).split('#', 1)[0]
    rescue.validate_url(url)
    suffix = PurePosixPath(unquote(urlsplit(url).path)).suffix.lower()
    if suffix in ('.pdf', '.docx', '.doc', '.txt', '.md', '.srt', '.vtt'):
        req = Request(url, headers={'User-Agent': 'Mozilla/5.0 FocusQuest/2.0'})
        with build_opener(rescue.PublicRedirect()).open(req, timeout=20) as response:
            content = response.read(5 * 1024 * 1024 + 1)
            if len(content) > 5 * 1024 * 1024:
                raise ValueError('链接文件超过5 MB，请分章节导入。')
            if response.headers.get_content_type() in ('text/html', 'application/xhtml+xml'):
                raise ValueError('文件链接返回了网页，可能需要登录；请打开原链接确认后导入文件。')
            name = PurePosixPath(unquote(urlsplit(url).path)).name
            if suffix in ('.txt', '.md', '.srt', '.vtt'):
                raw = content.decode(response.headers.get_content_charset() or 'utf-8-sig')
                content_text = rescue._subtitle_text(raw) if suffix in ('.srt', '.vtt') else raw
                return {'title': name, 'text': content_text, 'thin': not bool(content_text.strip()),
                        'note': '已读取链接中的文字文件。', 'kind': 'document', 'url': url}
        result = rescue.extract_uploaded({'name': name, 'content': base64.b64encode(content).decode()})
        return dict(result, url=url, kind='document')
    if is_video_link(url):
        from growth_video import extract_video
        return extract_video(url)
    if rescue.parse_feishu_url(url):
        return rescue.extract(url)
    from growth_web import read_web
    return read_web(url)
