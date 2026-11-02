"""Normalize public share redirects; report access requirements without importing cookies."""
import re
from urllib.parse import urlparse
from urllib.request import Request, build_opener

DOUYIN_HOSTS={'douyin.com','www.douyin.com','iesdouyin.com','www.iesdouyin.com','v.douyin.com'}

def canonical_video_url(url):
    from rescue_service import validate_url,PublicRedirect,RescueError
    parsed=urlparse(url)
    if parsed.hostname not in DOUYIN_HOSTS:return url
    validate_url(url)
    match=re.match(r'^/(?:share/)?video/(\d+)(?:/|$)',parsed.path)
    if match:return 'https://www.douyin.com/video/'+match[1]
    if parsed.hostname!='v.douyin.com':return url
    request=Request(url,headers={'User-Agent':'Mozilla/5.0 FocusQuest/3.0'})
    try:
        with build_opener(PublicRedirect()).open(request,timeout=12) as response:
            target=response.geturl()
        validate_url(target)
        final=urlparse(target)
        match=re.match(r'^/(?:share/)?video/(\d+)(?:/|$)',final.path)
        if final.hostname in DOUYIN_HOSTS and match:
            return 'https://www.douyin.com/video/'+match[1]
    except (OSError,ValueError) as exc:
        raise RescueError('视频分享链接暂未完成跳转，可打开原链接核对或重试。','VIDEO_REDIRECT_FAILED',422) from exc
    raise RescueError('这条分享链接没有指向可识别的单条视频。请提供具体视频，或上传原文件。','VIDEO_SINGLE_REQUIRED',422)

def video_error(exc):
    from rescue_service import RescueError
    text=str(exc).lower()
    if any(marker in text for marker in ('fresh cookies','login required','sign in','authentication required')):
        return RescueError('视频平台要求有效的访问会话，当前尚未取得视频正文。可打开原平台核对，或上传你有权使用的视频、字幕继续。','VIDEO_SESSION_REQUIRED',422)
    if 'unsupported url' in text:
        return RescueError('当前链接格式未被视频组件识别。请打开原文取得具体视频链接，或直接上传文件。','VIDEO_URL_UNSUPPORTED',422)
    return RescueError('视频页面或字幕暂时读不到，可重试或上传原视频、字幕。','VIDEO_UNAVAILABLE',502)

class QuietVideoLogger:
    def debug(self,message):pass
    def warning(self,message):pass
    def error(self,message):pass
