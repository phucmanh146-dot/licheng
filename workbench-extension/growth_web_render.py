"""Isolated rendering for public article pages; no user browser profile."""
import os
from pathlib import Path
from urllib.parse import urlparse
from rescue_service import validate_url

SELECTORS = 'article,#js_content,.J-articleContent,.com-markdown-collpase-main,.com-markdown,.article-content,.markdown-body,.entry-content,.post-content,.rich_media_content,[itemprop="articleBody"],main,[role="main"],[role="article"]'


def render(url):
    from playwright.sync_api import sync_playwright
    validate_url(url)
    path = Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=str(path) if path.is_file() else None,
                                    headless=True, chromium_sandbox=True)
        try:
            context = browser.new_context(accept_downloads=False, service_workers='block')
            checked = set()

            def route(request):
                try:
                    if request.request.resource_type not in ('document', 'script', 'xhr', 'fetch', 'stylesheet'):
                        return request.abort()
                    address = request.request.url.split('#')[0]
                    host = urlparse(address).netloc
                    if host not in checked:
                        validate_url(address)
                        checked.add(host)
                    request.continue_()
                except Exception:
                    request.abort()

            context.route('**/*', route)
            page = context.new_page()
            page.goto(url, wait_until='domcontentloaded', timeout=25000)
            page.locator(SELECTORS).first.wait_for(state='attached', timeout=10000)
            result = page.locator(SELECTORS).evaluate_all('(nodes)=>nodes.map(n=>({html:n.outerHTML,length:n.innerText.length})).sort((a,b)=>b.length-a.length)[0]')
            return page.title(), result['html'] if result else ''
        finally:
            browser.close()
