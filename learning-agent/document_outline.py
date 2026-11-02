"""Preserve source order and hierarchy; never invent lessons from a URL."""
import re
import zipfile
from io import BytesIO
from xml.etree import ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse


def article_body(raw, url):
    """Prefer the article body; preserve its heading markup and source title."""
    class Body(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.depth, self.parts, self.found = 0, [], False
        def handle_starttag(self, tag, attrs):
            selected = dict(attrs).get('id') == 'js_content' if (urlparse(url).hostname or '') == 'mp.weixin.qq.com' else tag == 'article'
            if not self.found and selected:
                self.found, self.depth = True, 1
                self.parts.append(self.get_starttag_text())
            elif self.depth:
                self.parts.append(self.get_starttag_text())
                if tag not in ('br','img','hr','input','meta','link','source','wbr'):
                    self.depth += 1
        def handle_endtag(self, tag):
            if self.depth:
                self.parts.append('</' + tag + '>')
                if tag not in ('br','img','hr','input','meta','link','source','wbr'):
                    self.depth -= 1
        def handle_data(self, data):
            if self.depth:
                self.parts.append(data)
        def handle_entityref(self, name):
            self.handle_data('&' + name + ';')
        def handle_charref(self, name):
            self.handle_data('&#' + name + ';')
    parser = Body()
    parser.feed(raw)
    title = re.search(r'<title\b[^>]*>.*?</title>', raw, re.I | re.S)
    return ((title[0] if title else '') + '\n' + ''.join(parser.parts)) if parser.parts else raw


class OutlineParser(HTMLParser):
    def __init__(self, url):
        super().__init__(convert_charrefs=True)
        self.url, self.skip, self.lists = url, [], []
        self.outline, self.blocks, self.current, self.capture = [], [], None, None
        self.heading_level = 0

    def flush(self):
        if not self.capture:
            return
        item, self.capture = self.capture, None
        title = re.sub(r"\s+", " ", "".join(item.pop('parts'))).strip()
        if not title:
            return
        item['title'] = title[:300]
        item['text'] = ''
        self.outline.append(item)
        self.current = item
        self.blocks.append('#' * min(6, item['level']) + ' ' + title)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header'):
            self.skip.append(tag)
            return
        if self.skip:
            return
        if tag in ('ul', 'ol'):
            self.flush()
            self.lists.append(tag)
        if re.fullmatch('h[1-6]', tag):
            self.flush()
            self.heading_level = int(tag[1])
            self.capture = {'level': self.heading_level, 'parts': [], 'kind': 'heading', 'url': ''}
        elif tag == 'li':
            self.flush()
            self.capture = {'level': self.heading_level + max(1, len(self.lists)), 'parts': [], 'kind': 'list', 'url': ''}
        elif tag == 'a' and self.capture:
            link = urljoin(self.url, attrs.get('href', ''))
            if attrs.get('href') and not attrs['href'].startswith('#') and urlparse(link).scheme in ('http', 'https'):
                self.capture['url'] = link
        elif tag in ('p', 'br', 'div', 'tr'):
            self.blocks.append('\n')
            if self.current and not self.capture:
                self.current['text'] += '\n'

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
            return
        if re.fullmatch('h[1-6]', tag) or tag == 'li':
            self.flush()
        if tag in ('ol', 'ul') and self.lists:
            self.lists.pop()

    def handle_data(self, data):
        if self.skip:
            return
        if self.capture:
            self.capture['parts'].append(data)
        else:
            self.blocks.append(data)
            if self.current:
                self.current['text'] += data


def enrich_page(raw, url, result):
    parser = OutlineParser(url)
    parser.feed(raw)
    parser.flush()
    outline = parser.outline[:500]
    for item in outline:
        item['text'] = item['text'].strip()[:12000]
    # A page title is a wrapper, not an extra course.
    if len(outline) > 1 and outline[0]['kind'] == 'heading' and outline[0]['level'] < min(x['level'] for x in outline[1:]):
        outline = outline[1:]
    result['outline'] = outline
    result['outlineComplete'] = len(parser.outline) <= 500
    if outline:
        result['text'] = re.sub(r'\n[ \t]*\n+', '\n\n', '\n'.join(parser.blocks)).strip()[:80000]
    host = (urlparse(url).hostname or '').lower()
    if any(host == domain or host.endswith('.' + domain) for domain in ('feishu.cn', 'larksuite.com')):
        meaningful = [x for x in outline if x['title'] not in ('登录', 'Log in', 'Sign in')]
        if not meaningful:
            result.update(thin=True, outline=[], requiresImport=True,
                          note='飞书没有返回可读取的课程目录或正文。请在已登录的飞书导出 Word/Markdown/HTML，或复制带层级的目录和正文；不会用登录页生成关卡。')
    return result


def read_docx(raw):
    """Keep paragraphs, Word heading styles and nested numbered lists intact."""
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    val = '{' + ns['w'] + '}val'
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        if sum(x.file_size for x in archive.infolist()) > 50_000_000:
            raise ValueError('Expanded Word file is too large')
        xml = archive.read('word/document.xml')
        styles = {}
        if 'word/styles.xml' in archive.namelist():
            root = ET.fromstring(archive.read('word/styles.xml'))
            for style in root.findall('w:style', ns):
                outline = style.find('w:pPr/w:outlineLvl', ns)
                name = style.find('w:name', ns)
                sid = style.get('{' + ns['w'] + '}styleId')
                if outline is not None:
                    styles[sid] = int(outline.get(val, '0')) + 1
                elif name is not None:
                    match = re.search(r'(?:heading|标题)\s*([1-6])', name.get(val, ''), re.I)
                    if match:
                        styles[sid] = int(match[1])
        root = ET.fromstring(xml)
    lines, outline, current, heading_level = [], [], None, 0
    for paragraph in root.findall('.//w:p', ns):
        text = ''.join(t.text or '' for t in paragraph.findall('.//w:t', ns)).strip()
        if not text:
            continue
        style = paragraph.find('w:pPr/w:pStyle', ns)
        explicit = paragraph.find('w:pPr/w:outlineLvl', ns)
        list_level = paragraph.find('w:pPr/w:numPr/w:ilvl', ns)
        level = styles.get(style.get(val), 0) if style is not None else 0
        if explicit is not None:
            level = int(explicit.get(val, '0')) + 1
        if level:
            heading_level = level
        elif list_level is not None:
            level = heading_level + int(list_level.get(val, '0')) + 1
        if level:
            current = {'title': text, 'level': level, 'text': '', 'url': '', 'kind': 'heading' if list_level is None else 'list'}
            outline.append(current)
            lines.append('#' * min(level, 6) + ' ' + text)
        else:
            lines.append(text)
            if current:
                current['text'] += text + '\n'
    return '\n\n'.join(lines), outline
