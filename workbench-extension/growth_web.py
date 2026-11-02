"""Public article/search-page reader with redirect and content-type handling."""
import base64
from html.parser import HTMLParser
import json
import re
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, build_opener

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
SKIP = {'script', 'style', 'noscript', 'svg', 'nav', 'footer', 'aside'}


class BodyParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.active, self.found, self.paragraphs = [], [], [], []
        self.title, self.redirect, self.meta_title = [], '', ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and (attrs.get('property') or attrs.get('name', '')).lower() in ('og:title', 'twitter:title'):
            self.meta_title = attrs.get('content') or self.meta_title
        if tag == 'meta' and 'noscript' not in self.stack and attrs.get('http-equiv', '').lower() == 'refresh':
            match = re.search(r'url\s*=\s*(.+)', attrs.get('content', ''), re.I)
            if match: self.redirect = match.group(1).strip(' \"\'')
        if tag in VOID:
            if tag in ('br', 'hr'): self.handle_data('\n')
            return
        self.stack.append(tag)
        identity = attrs.get('id', '') + ' ' + attrs.get('class', '')
        if any(t in SKIP for t in self.stack): return
        rank = None
        if attrs.get('id') in ('js_content', 'content_left') or attrs.get('itemprop') == 'articleBody': rank = 0
        elif re.search(r'(?:^|[\s_-])(?:article[-_]?(?:content|body|wrap)|rich_media_content|entry-content|post-content|markdown-body|ssr-content)(?:$|[\s_-])', identity, re.I): rank = 1
        elif tag == 'article': rank = 2
        elif tag == 'main' or attrs.get('role') in ('main', 'article'): rank = 3
        if rank is not None:
            self.active.append({'depth': len(self.stack), 'rank': rank, 'parts': [], 'search': attrs.get('id') == 'content_left'})
        if tag == 'p': self.active.append({'depth': len(self.stack), 'rank': 9, 'parts': [], 'search': False})
        if tag in ('p', 'div', 'section', 'h1', 'h2', 'h3', 'li', 'blockquote'): self.handle_data('\n')

    def handle_endtag(self, tag):
        if tag not in self.stack: return
        depth = len(self.stack) - self.stack[::-1].index(tag)
        closing = [n for n in self.active if n['depth'] >= depth]
        for node in closing:
            value = re.sub(r'\n[ \t]*\n+', '\n\n', ''.join(node['parts'])).strip()
            if node['rank'] == 9:
                if len(value) >= 30: self.paragraphs.append(value)
            elif value: self.found.append((node['rank'], value, node['search']))
        self.active = [n for n in self.active if n['depth'] < depth]
        self.stack = self.stack[:depth - 1]
        if tag in ('p', 'div', 'section', 'h1', 'h2', 'h3', 'li', 'blockquote'): self.handle_data('\n')

    def handle_data(self, value):
        if 'title' in self.stack: self.title.append(value)
        if any(t in SKIP for t in self.stack): return
        for node in self.active: node['parts'].append(value)


def parse_page(raw, url):
    import rescue_service as rescue
    parser = BodyParser(); parser.feed(raw); parser.close()
    # Finish open containers on pages with omitted closing tags.
    if parser.stack: parser.handle_endtag(parser.stack[0])
    heading = re.search(r'<h1\b[^>]*>(.*?)</h1>', raw, re.I | re.S)
    title = ''.join(parser.title).strip() or parser.meta_title or (rescue.plain(heading.group(1)) if heading else '') or urlsplit(url).netloc
    if re.search(r'安全验证|访问验证|验证码|环境异常|验证中心|请登录|access denied|just a moment|verify you are human', title, re.I):
        raise rescue.RescueError('原网页要求登录或验证，请在原网站处理后重试；当前没有取得正文。', 'SOURCE_REQUIRES_LOGIN', 422)
    eligible = [item for item in parser.found if len(item[1]) >= 60]
    if eligible:
        rank = min(x[0] for x in eligible)
        _, body, search = max((x for x in eligible if x[0] == rank), key=lambda x: len(x[1]))
        return {'title': title, 'text': body[:80000], 'chars': len(body), 'thin': False,
                'url': url, 'source': urlsplit(url).netloc, 'kind': 'search-results' if search else 'web-article',
                'method': 'public-article', 'note': '这是百度搜索结果页的内容，尚未逐篇读取结果链接的文章。' if search else ''}
    if re.search(r'环境异常|完成验证后继续|captcha-container|id=[\"\'](?:captcha|verify)', raw, re.I):
        raise rescue.RescueError('页面要求浏览器验证，当前未读取正文。', 'SOURCE_REQUIRES_LOGIN', 422)
    for script in re.findall(r'<script\b[^>]*type=[\"\']application/ld\+json[\"\'][^>]*>(.*?)</script>', raw, re.I | re.S):
        try:
            queue = [json.loads(script)]
            while queue:
                item = queue.pop()
                if isinstance(item, list): queue.extend(item)
                elif isinstance(item, dict):
                    if isinstance(item.get('articleBody'), str) and len(item['articleBody']) >= 60:
                        body = item['articleBody']
                        return {'title': item.get('headline') or title, 'text': body[:80000], 'url': url,
                                'chars': len(body), 'thin': False, 'kind': 'web-article', 'method': 'article-data', 'note': ''}
                    if '@graph' in item: queue.append(item['@graph'])
        except (ValueError, TypeError): pass
    if len(parser.paragraphs) >= 2 and sum(map(len, parser.paragraphs)) >= 300:
        body = '\n\n'.join(dict.fromkeys(parser.paragraphs))
        return {'title': title, 'text': body[:80000], 'url': url, 'chars': len(body), 'thin': False,
                'kind': 'web-excerpt', 'method': 'paragraphs', 'note': '已提取页面中的正文段落；动态折叠内容可能未包含，请核对原文。'}
    return {'title': title, 'text': '', 'thin': True, 'redirect': parser.redirect, 'url': url}


def read_web(url, redirects=0):
    import rescue_service as rescue
    rescue.validate_url(url)
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0 FocusQuest/2.0', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'})
    try:
        with build_opener(rescue.PublicRedirect()).open(request, timeout=15) as response:
            final_url = response.geturl()
            rescue.validate_url(final_url)
            content_type = response.headers.get_content_type()
            data = response.read(5 * 1024 * 1024 + 1)
            charset = response.headers.get_content_charset()
    except HTTPError as exc:
        if exc.code in (401, 403, 412, 429):
            raise rescue.RescueError('原网站拒绝当前自动读取请求（HTTP ' + str(exc.code) + '），链接已保存，可在原网站确认访问权限。', 'SOURCE_REQUIRES_LOGIN', 422) from None
        raise rescue.RescueError('原网页返回HTTP ' + str(exc.code) + '，请确认链接仍然有效。', 'SOURCE_HTTP_ERROR', 422) from None
    if len(data) > 5 * 1024 * 1024:
        raise ValueError('链接内容超过5 MB，请导出并分章节导入。')
    if content_type == 'application/pdf' or data.startswith(b'%PDF-'):
        return dict(rescue.extract_uploaded({'name': 'linked-document.pdf', 'content': base64.b64encode(data).decode()}), url=final_url, kind='document')
    if content_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return dict(rescue.extract_uploaded({'name': 'linked-document.docx', 'content': base64.b64encode(data).decode()}), url=final_url, kind='document')
    if content_type not in ('text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown', 'text/xml', 'application/xml'):
        raise ValueError('此链接返回的不是网页正文或支持的文档，请使用对应文章/视频页面链接。')
    if not charset:
        hint = re.search(br'charset\s*=\s*[\"\']?([\w-]+)', data[:4096], re.I)
        charset = hint.group(1).decode() if hint else 'utf-8'
    try: raw = data.decode(charset, errors='replace')
    except LookupError: raw = data.decode('utf-8', errors='replace')
    if content_type in ('text/plain', 'text/markdown') and '<html' not in raw.lower():
        return {'title': final_url, 'text': raw[:80000], 'chars': len(raw), 'thin': not bool(raw.strip()), 'url': final_url, 'kind': 'document'}
    result = parse_page(raw, final_url)
    # Some public Baidu result pages explicitly navigate back to the same HTTP
    # URL. Follow only this exact navigation, without executing arbitrary script
    # or taking a noscript homepage fallback that would discard the search query.
    if result['thin'] and redirects < 4 and urlsplit(final_url).hostname in ('www.baidu.com', 'baidu.com') and final_url.startswith('https://'):
        if re.search(r'location\.replace\(\s*location\.href\.replace\(\s*[\"\']https://[\"\']\s*,\s*[\"\']http://[\"\']\s*\)\s*\)', raw):
            return read_web('http://' + final_url[len('https://'):], redirects + 1)
    if result.get('redirect') and redirects < 4:
        return read_web(urljoin(final_url, result['redirect']), redirects + 1)
    from growth_sources import is_video_link
    if is_video_link(final_url):
        from growth_video import extract_video
        return extract_video(final_url)
    if not result['thin']: return result
    from growth_web_render import render
    try:
        title, rendered = render(final_url)
        result = parse_page('<title>' + title.replace('<', '&lt;') + '</title>' + rendered, final_url)
        if not result['thin']:
            result['method'] = 'browser-article'
            return result
    except rescue.RescueError: raise
    except Exception: pass
    raise rescue.RescueError('没有取得可靠正文，可能是登录页、动态页面或内容已删除；请在原网页确认或补充正文。', 'BODY_NOT_FOUND', 422)
