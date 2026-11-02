"""Shared, read-only WeChat controls and compatibility route adapters.

Only named search Edit controls are filled. No chat composer or send action.
"""
import threading
from contextlib import contextmanager
from rescue_service import RescueError

LOCK = threading.Lock()


@contextmanager
def automation():
    if not LOCK.acquire(blocking=False):
        raise RescueError('微信正在完成上一次搜索，请稍后。', 'WECHAT_BUSY', 409)
    initialized = False
    try:
        import pythoncom
        pythoncom.CoInitialize()
        initialized = True
        yield
    finally:
        if initialized:
            pythoncom.CoUninitialize()
        LOCK.release()


def name(node):
    try:
        return node.window_text().strip()
    except Exception:
        return ''


def clean(value):
    value = str(value).strip()
    if not value or len(value) > 100 or any(ord(c) < 32 for c in value):
        raise RescueError('请输入一行、100字以内的搜索词。', 'BAD_QUERY', 400)
    return value


def fill(edit, value):
    try:
        edit.set_edit_text(value)
    except Exception:
        raise RescueError('微信搜索框不支持可靠的文字输入，本次未执行搜索。', 'WECHAT_INPUT_UNAVAILABLE', 409) from None


def search_groups(query):
    from growth_wechat import search_group_list
    return search_group_list(query)


def read_messages(identifier, keyword):
    from growth_wechat import read_group_messages
    result = read_group_messages(identifier, keyword)
    return dict(result, text='\n\n'.join(m['text'] for m in result.get('messages', [])))
