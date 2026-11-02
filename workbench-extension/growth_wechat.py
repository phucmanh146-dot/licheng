"""Read a keyword from the logged-in WeChat client's native search controls."""
import time
import re
import threading
from rescue_service import RescueError
from sy_wechat_search import automation, clean, fill, name

SEARCH_NAMES = {'搜索', 'Search', '搜索联系人、群聊和聊天记录', '搜索联系人和聊天记录'}
SCOPES = {'聊天记录', '聊天记录搜索结果', 'Chat history', 'Chat History', '聊天記錄'}
GROUP_SCOPES = {'群聊', '群聊搜索结果', 'Group chats', 'Groups', '群組'}
CONTACT_SCOPES = {'联系人', 'Contacts', '联系人搜索结果'}
CANCEL = threading.Event()


def cancel_search():
    CANCEL.set()
    return {'ok': True}


def check_cancelled():
    if CANCEL.is_set(): raise RescueError('本次微信查找已停止。', 'WECHAT_CANCELLED', 409)


def native(node):
    """An embedded web page must never be mistaken for the chat search box."""
    for _ in range(20):
        if node is None: break
        info = node.element_info
        if info.control_type == 'Document' or info.class_name.startswith(('Chrome', 'Omnibox')):
            return False
        node = node.parent()
    return True


def search_boxes(window):
    return [e for e in window.descendants(control_type='Edit')
            if e.is_visible() and name(e) in SEARCH_NAMES and native(e)]


def connect_window(allow_opaque=False):
    import ctypes
    from ctypes import wintypes
    import psutil
    import pygetwindow
    from pywinauto import Desktop
    clients, login, opaque = [], [], []
    for raw in pygetwindow.getAllWindows():
        if raw.title not in ('微信', 'WeChat', 'Weixin'): continue
        pid = wintypes.DWORD()
        ctypes.windll.user32.GetWindowThreadProcessId(raw._hWnd, ctypes.byref(pid))
        try:
            if psutil.Process(pid.value).name().lower() not in ('weixin.exe', 'wechat.exe'): continue
            window = Desktop(backend='uia').window(handle=raw._hWnd).wrapper_object()
            if raw.isMinimized: window.restore()
            buttons = [name(b) for b in window.descendants(control_type='Button') if native(b)]
            if 'LoginWindow' in window.element_info.class_name or any(b in ('进入微信', '扫码登录', 'Log in') for b in buttons):
                login.append(window)
            elif len(search_boxes(window)) == 1 or (window.element_info.class_name in ('mmui::MainWindow', 'WeChatMainWndForPC') and any(b in SEARCH_NAMES for b in buttons)):
                clients.append(window)
            elif window.is_visible() and raw.width > 500 and raw.height > 400:
                opaque.append(window)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    if len(clients) > 1:
        raise RescueError('找到了多个可读取的微信主窗口，请将需要查询的微信保留打开后重试。', 'WECHAT_AMBIGUOUS', 409)
    if not clients:
        if opaque:
            if allow_opaque and len(opaque) != 1:
                raise RescueError('有多个微信窗口，请先保留要操作的聊天主窗口。', 'WECHAT_AMBIGUOUS', 409)
            try: opaque[0].set_focus()
            except Exception: pass
            if allow_opaque: return opaque[0]
            raise RescueError('找到了微信窗口，但该窗口没有提供可识别的聊天搜索控件。可能已经登录，不能因此判定未登录；请切到聊天主界面后重试，或在远程面板复制所需结果。', 'WECHAT_ACCESSIBILITY_UNAVAILABLE', 409)
        if login:
            try: login[0].set_focus()
            except Exception: pass
            raise RescueError('微信停在登录页面，请先点击“进入微信”完成登录，再点“打开微信并读取关键词”。', 'WECHAT_LOGIN_REQUIRED', 409)
        message = '没有找到可读取的微信聊天主窗口。请打开并登录电脑版微信；如果已登录，此版本可能未开放搜索控件。'
        raise RescueError(message, 'WECHAT_SEARCH_UNAVAILABLE', 409)
    window = clients[0]
    try: window.set_focus()
    except Exception:
        raise RescueError('已找到微信，但无法打开到前台。请点开微信后重试。', 'WECHAT_FOCUS', 409) from None
    return window


def open_wechat():
    with automation():
        window = connect_window(allow_opaque=True)
        try: window.set_focus()
        except Exception:
            raise RescueError('微信没有切到前台，请在任务栏点开微信。', 'WECHAT_FOCUS', 409) from None
    return {'ok': True, 'note': '已打开微信。回到上岸鸭，点击“连接微信并跟随”选择这个窗口。'}


def open_search(window):
    edits = search_boxes(window)
    if len(edits) == 1: return edits[0]
    buttons = [b for b in window.descendants(control_type='Button') if b.is_visible() and native(b) and name(b) in SEARCH_NAMES]
    if len(buttons) == 1:
        buttons[0].click_input()
        for _ in range(8):
            time.sleep(.2)
            edits = search_boxes(window)
            if len(edits) == 1: return edits[0]
    raise RescueError('微信搜索框尚未展开或无法唯一识别，请切到聊天主界面后重试。', 'WECHAT_SEARCH_UNAVAILABLE', 409)


def matched_messages(window, keyword):
    texts = []
    for node in window.descendants(control_type='ListItem'):
        if not node.is_visible() or not native(node): continue
        label = name(node)
        if keyword.casefold() not in label.casefold(): continue
        parent, scoped = node.parent(), False
        for _ in range(5):
            if parent is None: break
            if name(parent) in SCOPES: scoped = True; break
            parent = parent.parent()
        if scoped and label not in texts: texts.append(label[:5000])
        if len(texts) == 50: break
    return texts


def row_text(node):
    parts = [name(node)]
    for child in node.descendants(control_type='Text')[:40]:
        value = name(child)
        if value and value not in parts and value not in parts[0]: parts.append(value)
    return '\n'.join(p for p in parts if p)[:5000]


def search_results(window, keyword):
    """Headers in WeChat 4's search_list are siblings of their result rows."""
    groups, contacts, messages, conversations = [], [], [], []
    lists = [n for n in window.descendants(control_type='List') if n.is_visible() and native(n)
             and (getattr(n.element_info, 'automation_id', '') == 'search_list' or name(n) in SCOPES | GROUP_SCOPES | CONTACT_SCOPES | {'搜索结果', 'Search results'})]
    for container in lists:
        scope = name(container)
        for node in container.children(control_type='ListItem')[:120]:
            if not node.is_visible() or not native(node): continue
            label = name(node)
            if label in SCOPES | GROUP_SCOPES | CONTACT_SCOPES | {'公众号', 'Public Accounts', '功能', '更多'}:
                scope = label; continue
            raw = row_text(node)
            if not raw: continue
            if scope in GROUP_SCOPES:
                group = {'name': label or raw.splitlines()[0], 'preview': raw, 'matchedBy': '微信群聊搜索结果'}
                if not any(g['name'] == group['name'] for g in groups): groups.append(group)
            elif scope in CONTACT_SCOPES:
                contact = {'name': label or raw.splitlines()[0], 'preview': raw}
                if not any(c['name'] == contact['name'] for c in contacts): contacts.append(contact)
            elif scope in SCOPES:
                if re.search(r'\d+\s*条(?:相关)?(?:聊天)?记录|\d+\s*(?:matching|related)\s*(?:messages|records)', raw, re.I):
                    if raw not in conversations: conversations.append(raw)
                elif keyword.casefold() in raw.casefold() and raw not in messages:
                    messages.append(raw)
    # Also support older versions with a named search-result parent.
    for raw in matched_messages(window, keyword):
        if raw not in messages and raw not in conversations and not re.search(r'\d+\s*条(?:相关)?(?:聊天)?记录', raw): messages.append(raw)
    return {'groups': groups[:30], 'contacts': contacts[:30], 'messages': [{'text': raw} for raw in messages[:50]], 'conversations': conversations[:30]}


def search_messages(keyword):
    keyword = clean(keyword)
    with automation():
        CANCEL.clear()
        window = connect_window()
        check_cancelled()
        fill(open_search(window), keyword)
        # Results arrive asynchronously. Read only identified search result lists.
        result = {'groups': [], 'messages': [], 'conversations': []}
        for _ in range(8):
            check_cancelled()
            time.sleep(.3)
            result = search_results(window, keyword)
            if any(result.values()): break
        if not any(result.values()):
            tabs = [e for e in window.descendants() if e.is_visible() and native(e)
                    and e.element_info.control_type in ('TabItem', 'Button', 'ListItem')
                    and name(e) in ('聊天记录', 'Chat history')]
            if len(tabs) == 1:
                check_cancelled()
                tabs[0].click_input()
                for _ in range(6):
                    check_cancelled()
                    time.sleep(.3)
                    result = search_results(window, keyword)
                    if any(result.values()): break
        if not any(result.values()):
            visible = {name(n) for n in window.descendants() if n.is_visible() and native(n)}
            if visible & {'无搜索结果', '未找到相关结果', 'No results', 'No Results'}:
                return dict(result, text='', count=0, groupCount=0, keyword=keyword, source='wechat-accessibility', empty=True, scope='当前微信搜索结果')
            raise RescueError('微信已打开并搜索该关键词，但没有读到可确认的群聊或匹配消息。请核对微信搜索结果，或复制需要的正文到工作台。', 'NO_READABLE_MESSAGES', 422)
        remember_choices(result, keyword)
        texts = [m['text'] for m in result['messages']]
        body = ('来源：电脑版微信；关键词：' + keyword + '\n仅包含当前可读取的匹配消息，不代表全部聊天历史。\n\n' + '\n\n'.join(texts))[:30000] if texts else ''
        return dict(result, text=body, count=len(texts), groupCount=len(result['groups']), keyword=keyword, source='wechat-accessibility', scope='当前可读取的关键词搜索结果')


GROUP_CHOICES = {}
NAV_CHOICES = {}


def remember_choices(found, query):
    import secrets
    GROUP_CHOICES.clear(); NAV_CHOICES.clear()
    for category, kind in [('groups', 'group'), ('contacts', 'contact')]:
        for item in found.get(category, []):
            identifier = secrets.token_urlsafe(18)
            choice = {'name': item['name'], 'query': query, 'kind': kind, 'until': time.monotonic()+180}
            NAV_CHOICES[identifier] = choice
            item['openId'] = identifier
            if kind == 'group':
                GROUP_CHOICES[identifier] = choice
                item['id'] = identifier


def search_group_list(query):
    query = clean(query)
    found = search_messages(query)
    return {'groups': found['groups'], 'contacts': found.get('contacts', []), 'messages': [], 'conversations': [], 'keyword': query,
            'note': '选择联系人可打开聊天；选择群后可继续查找消息。', 'source': 'wechat-accessibility'}


def result_controls(window, kind, target_name):
    scopes = GROUP_SCOPES if kind == 'group' else CONTACT_SCOPES
    result = []
    for container in window.descendants(control_type='List'):
        if not container.is_visible() or not native(container): continue
        if getattr(container.element_info, 'automation_id', '') != 'search_list' and name(container) not in scopes | {'搜索结果', 'Search results'}: continue
        scope = name(container)
        for node in container.children(control_type='ListItem')[:120]:
            label = name(node)
            if label in SCOPES | GROUP_SCOPES | CONTACT_SCOPES | {'公众号', 'Public Accounts', '功能', '更多'}:
                scope = label; continue
            if scope in scopes and label == target_name and node.is_visible() and native(node): result.append(node)
    return result


def group_controls(window, group_name):
    return result_controls(window, 'group', group_name)


def open_choice(identifier):
    chosen = NAV_CHOICES.get(str(identifier))
    if not chosen or time.monotonic() > chosen['until']:
        raise RescueError('这条搜索结果已过期，请重新生成列表。', 'CHOICE_EXPIRED', 409)
    with automation():
        CANCEL.clear(); window = connect_window(); check_cancelled()
        fill(open_search(window), chosen['query']); time.sleep(.8); check_cancelled()
        candidates = result_controls(window, chosen['kind'], chosen['name'])
        if len(candidates) != 1:
            raise RescueError('无法唯一确认这条结果，请在微信中核对后重新选择。', 'CHOICE_AMBIGUOUS', 409)
        candidates[0].click_input(); check_cancelled()
    return {'ok': True, 'name': chosen['name'], 'kind': chosen['kind']}


def read_group_messages(identifier, keyword):
    keyword = clean(keyword)
    chosen = GROUP_CHOICES.get(str(identifier))
    if not chosen or time.monotonic() > chosen['until']:
        raise RescueError('群列表已过期，请重新生成列表并选择。', 'GROUP_EXPIRED', 409)
    with automation():
        CANCEL.clear(); window = connect_window(); check_cancelled()
        fill(open_search(window), chosen['query']); time.sleep(.8); check_cancelled()
        candidates = group_controls(window, chosen['name'])
        if len(candidates) != 1:
            raise RescueError('无法唯一确认选中的群，请重新生成群列表。', 'GROUP_AMBIGUOUS', 409)
        candidates[0].click_input(); time.sleep(.4); check_cancelled()
        buttons = [n for n in window.descendants(control_type='Button') if n.is_visible() and native(n)
            and name(n) in ('搜索聊天记录', '查找聊天记录', 'Search chat history')]
        if len(buttons) != 1:
            raise RescueError('已选中该群，但微信未开放聊天记录搜索控件。可在微信里搜索关键词，再使用浮动框选或“读取当前结果”。', 'HISTORY_UNAVAILABLE', 409)
        buttons[0].click_input(); time.sleep(.3); check_cancelled()
        edits = [n for n in window.descendants(control_type='Edit') if n.is_visible() and native(n)
            and name(n) in ('搜索聊天记录', '搜索关键字', '搜索关键词', 'Search chat history')]
        if len(edits) != 1:
            raise RescueError('聊天记录搜索框无法唯一确认，请在微信搜索后框选。', 'HISTORY_UNAVAILABLE', 409)
        fill(edits[0], keyword); time.sleep(.7); check_cancelled()
        result = search_results(window, keyword)
        if not result['messages']:
            raise RescueError('尚未读到所选群的匹配消息正文，可展开搜索结果后框选。', 'NO_READABLE_MESSAGES', 422)
        for message in result['messages']: message['group'] = chosen['name']
        return dict(result, groups=[], group=chosen['name'], keyword=keyword,
                    source='wechat-accessibility', note='仅所选群中当前可读取的匹配消息，请勾选需要的内容。')
