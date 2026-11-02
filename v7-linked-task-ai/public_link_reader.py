"""Read public source text and keep web-search references separate from it."""
import json
import re
from html import unescape
from urllib.parse import urlparse
import rescue_service as service

VERSION = 'public-links-20261015'

def search_queries(title):
    title = re.sub(r'【[^】]+】|\b20\d{2}\b', ' ', title)
    title = re.sub(r'^\s*(?:AI|AIGC)\s+', '', title, flags=re.I)
    title = re.sub(r'\s+', ' ', title).strip(' ：:，,。？！?')
    primary = re.split(r'[？?！!：:，,]', title, maxsplit=1)[0]
    primary = re.sub(r'怎么选|如何选择|怎么用|如何使用|哪个好|有哪些', '', primary).strip()
    chinese = next(iter(re.findall(r'[\u4e00-\u9fff]{4,}', primary)), '')
    short = (chinese[:3] + (' 工具' if '工具' in primary else '')) if chinese else ''
    return list(dict.fromkeys(x for x in [title[:160], primary[:80], short] if x))

def relevant(row, topic):
    text = (str(row.get('title',''))+' '+str(row.get('snippet',''))).lower()
    core = next(iter(re.findall(r'[\u4e00-\u9fff]{4,}', topic)), '')
    core = re.sub(r'^(如何|怎么|为什么|关于|最新)', '', core)
    if core:
        core = core[:12]
        pairs = {core[i:i+2] for i in range(len(core)-1)}
        return core[:3] in text or sum(x in text for x in pairs) >= max(2, (len(pairs)+1)//2)
    words = [w for w in re.findall(r'[a-zA-Z][a-zA-Z0-9_-]{2,}',topic.lower()) if w not in ('the','how','and','for','with','www','com')]
    return bool(words) and any(w in text for w in words)


def community_data(raw):
    """Feishu community SSR is a share card, not the linked wiki document."""
    for match in re.finditer(r'"promptData"\s*:\s*', raw):
        try:
            value, _ = json.JSONDecoder().raw_decode(raw[match.end():])
            if isinstance(value, dict):
                return value
        except (ValueError, TypeError):
            continue
    return {}


def metadata(raw, url):
    parser = service.MetadataParser()
    parser.feed(raw)
    prompt = community_data(raw)
    title = prompt.get('name') or parser.meta.get('og:title') or ''.join(parser.title_parts)
    description = prompt.get('content') or parser.meta.get('og:description') or parser.meta.get('description')
    title = re.sub(r'\s+', ' ', str(title or '')).strip()[:300]
    description = re.sub(r'\s+', ' ', str(description or '')).strip()[:2000]
    linked = []
    target = str(prompt.get('worksLink') or '')
    try:
        p = urlparse(target)
        if p.scheme in ('http', 'https') and p.hostname and not p.username and not p.password:
            linked.append({'url': target, 'title': '分享页关联的文档', 'requiresConfirmation': True})
    except ValueError:
        pass
    return title, description, linked


def research(url='', title='', n=5):
    url = service.normalize_url(url).split('#', 1)[0]
    service.validate_url(url)
    title = re.sub(r'\s+', ' ', str(title or '')).strip()
    if not title:
        raw = service.fetch_page(url, timeout=12, limit=700000)
        title, _, _ = metadata(raw, url)
    # Never send share tokens, query parameters or article content to a search engine.
    title = re.sub(r'https?://\S+', '', title).strip()
    query = title[:180]
    if not query or query in ('飞书', '登录', 'Login', 'Feishu', 'Lark'):
        raise service.RescueError('没有取得可检索的公开标题，请补充文章标题或主题。', 'SEARCH_TITLE_REQUIRED', 422)
    queries=search_queries(query)
    rows=[];seen=set();providers=[];attempted=[]
    for candidate in queries:
        attempted.append(candidate)
        try:data=service.search_web(candidate,8)
        except (service.RescueError,OSError,ValueError):continue
        providers.append(data.get('provider',''))
        for row in data.get('results',[]):
            if row.get('url') not in seen and relevant(row,queries[0]):
                seen.add(row['url']);rows.append(row)
        if len(rows)>=min(n,3):break
    return {'query':query,'attemptedQueries':attempted,'results':rows[:n],'provider':' / '.join(dict.fromkeys(providers)),
            'ok':True,'sourceUrl':url,'kind':'related_search',
            'note':('这些是联网检索的相关网页与摘要，不是原链接正文；请打开来源核对。' if rows else
                    '未找到与文章标题足够相关的网页，已排除泛化结果；原链接与已取得摘要仍保留。')}


def _read_public_feishu(url):
    """Try an unauthenticated public Feishu page before requiring OpenAPI credentials.

    Redirects are followed manually so every destination is revalidated and login
    loops are treated as an auth boundary, not as article content.
    """
    import requests
    from urllib.parse import urljoin
    current = url
    seen = set()
    for _ in range(8):
        service.validate_url(current)
        if current in seen:
            return None, True
        seen.add(current)
        try:
            response = requests.get(
                current,
                headers={'User-Agent': 'Mozilla/5.0 FocusQuest/2.0',
                         'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'},
                timeout=12,
                allow_redirects=False,
            )
        except requests.RequestException:
            return None, False
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get('Location')
            if not location:
                return None, False
            target = urljoin(current, location)
            parsed = urlparse(target)
            host = (parsed.hostname or '').lower()
            if host in ('accounts.feishu.cn', 'login.feishu.cn') or '/accounts/' in parsed.path:
                return None, True
            current = target
            continue
        if response.status_code >= 400:
            return None, False
        if response.headers.get('Content-Type', '').split(';', 1)[0].lower() not in (
            'text/html', 'text/plain', 'application/xhtml+xml'
        ):
            return None, False
        raw = response.text[:1000000]
        title, description, linked = metadata(raw, url)
        try:
            from document_outline import article_body
            body = article_body(raw, url)
            text = service.plain(body)
        except Exception:
            text = ''
        if len(text.strip()) >= 160 and not re.search(
            r'完成验证后继续|访问过于频繁|verify you are human|captcha-container',
            text, re.I
        ):
            return {
                'title': title or urlparse(url).netloc,
                'url': url,
                'text': text[:80000],
                'chars': len(text),
                'thin': False,
                'partial': len(text) > 80000,
                'outlineComplete': len(text) <= 80000,
                'sourceKind': 'article',
                'method': 'public-feishu-page',
                'source': urlparse(url).hostname or 'feishu.cn',
                'outline': [],
                'links': [],
                'linkedSources': linked,
                'note': '优先从公开分享页读取；未使用登录态或读取浏览器凭证。'
            }, False
        return None, False
    return None, True


def read_link(url):
    url = service.normalize_url(url).split('#', 1)[0]
    service.validate_url(url)
    host, path = urlparse(url).hostname or '', urlparse(url).path
    community = host in ('www.feishu.cn', 'feishu.cn') and path.startswith('/community/prompts/')
    feishu_host = (host == 'feishu.cn' or host.endswith('.feishu.cn') or
                   host == 'larksuite.com' or host.endswith('.larksuite.com'))
    result, error = None, None

    # Public Feishu shares should not be forced through tenant credentials first.
    # If the share redirects to login or contains only a shell, fall back to OpenAPI.
    if feishu_host and not community:
        result, login_required = _read_public_feishu(url)
        if result:
            return result
        try:
            result = service.extract(url)
            text = str(result.get('text') or result.get('content') or '')
            if text.strip() and not result.get('thin'):
                result.setdefault('sourceKind', 'article')
                return result
        except (service.RescueError, OSError, ValueError) as exc:
            error = exc
            if getattr(exc, 'code', '') == 'FEISHU_NOT_CONFIGURED' and login_required:
                raise service.RescueError(
                    '这条飞书链接跳转到了登录页，未能匿名读取正文。',
                    'FEISHU_AUTH_REQUIRED', 401,
                    how='请使用有权限的飞书应用授权后重试；本机已登录的飞书浏览器只能由本机桥接读取，公网网页不能自动继承本机登录态。'
                ) from exc
            if getattr(exc, 'code', '') == 'FEISHU_NOT_CONFIGURED':
                raise service.RescueError(
                    '公开分享页未返回足够正文，且当前没有配置飞书应用授权。',
                    'FEISHU_NOT_CONFIGURED', 503,
                    how='请在飞书开放平台配置具有 Wiki/云文档读取权限的应用；如果文档属于私有空间，需要先授予该应用访问权限。'
                ) from exc
            raise

    if not community:
        try:
            result = service.extract(url)
            text = str(result.get('text') or result.get('content') or '')
            if text.strip() and not result.get('thin'):
                result.setdefault('sourceKind', 'article')
                return result
        except (service.RescueError, OSError, ValueError) as exc:
            error = exc
    try:
        raw = service.fetch_page(url, timeout=15, limit=1000000)
        title, description, linked = metadata(raw, url)
    except (service.RescueError, OSError, ValueError):
        if error:
            raise error
        raise service.RescueError('公开网页暂时没有读到。可重试或按文章标题联网检索。', 'PUBLIC_READ_FAILED', 502)
    if not title or not description:
        if error:
            raise error
        raise service.RescueError('只取得页面框架，没有取得正文或公开摘要。可按文章标题联网检索。', 'NO_ARTICLE', 422)
    text = '# ' + title + '\n\n' + description
    result = {'title': title, 'url': url, 'text': text, 'chars': len(text), 'thin': False,
              'partial': True, 'outlineComplete': False, 'sourceKind': 'public_summary',
              'method': 'public-share-metadata', 'source': host, 'outline': [], 'links': [],
              'linkedSources': linked,
              'note': '仅取得分享页公开标题和摘要，尚未读到正文。关联文档需你确认后单独读取；联网结果不计入原文。'}
    try:
        result['relatedSearch'] = research(url, title)
    except (service.RescueError, OSError, ValueError) as exc:
        result['researchError'] = '自动检索暂未完成：' + str(exc)
    return result
