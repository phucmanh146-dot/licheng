"""Public progressive-video import; no login cookies, no DRM or manifest execution."""
import io, re, time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, build_opener
from rescue_service import RescueError, validate_url, PublicRedirect, is_video_url

def _download(url, headers, limit):
    validate_url(url)
    safe = {'User-Agent': str(headers.get('User-Agent') or 'Mozilla/5.0')}
    req = Request(url, headers=safe)
    deadline = time.monotonic() + 45
    out = io.BytesIO()
    with build_opener(PublicRedirect()).open(req, timeout=15) as response:
        length = response.headers.get('Content-Length')
        if length and int(length) > limit:
            raise RescueError('视频超过220MB，请裁剪后上传。','FILE_TOO_LARGE',413)
        while True:
            if time.monotonic() > deadline:
                raise RescueError('视频下载超时，请直接上传本地视频。','VIDEO_TIMEOUT',504)
            chunk = response.read(256 * 1024)
            if not chunk: break
            if out.tell() + len(chunk) > limit:
                raise RescueError('视频超过220MB，请裁剪后上传。','FILE_TOO_LARGE',413)
            out.write(chunk)
    out.seek(0)
    return out

def import_media(url):
    import pm_agent_bridge as bridge
    from source_support import normalize_url, image_text
    from video_source_urls import canonical_video_url,video_error,QuietVideoLogger
    url = canonical_video_url(normalize_url(url).split('#',1)[0])
    validate_url(url)
    if not is_video_url(url):
        raise RescueError('请提供支持的视频平台链接或直接上传视频。','UNSUPPORTED_SOURCE',400)
    import yt_dlp
    try:
        with yt_dlp.YoutubeDL({'quiet':True,'no_warnings':True,'noplaylist':True,'logger':QuietVideoLogger(),
            'skip_download':True,'socket_timeout':12,'retries':0,
            'extractor_retries':0,'playlistend':1}) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise video_error(exc) from exc
    if not isinstance(info,dict) or info.get('_type') in ('playlist','multi_video'):
        raise RescueError('请提供单条视频链接。','VIDEO_SINGLE_REQUIRED',422)
    formats = info.get('formats') or [info]
    candidates = [f for f in formats if f.get('url') and
        f.get('protocol') in (None,'https','http') and
        f.get('vcodec') != 'none' and f.get('ext') in ('mp4','webm') and
        not f.get('has_drm') and not f.get('fragments')]
    if not candidates:
        raise RescueError('当前链接只有分段或受保护的视频流；请上传可播放的视频文件。','VIDEO_STREAM_UNSUPPORTED',422)
    candidates.sort(key=lambda f:(f.get('acodec') != 'none',
        360 <= (f.get('height') or 0) <= 1080,
        -(abs((f.get('height') or 576)-576))),reverse=True)
    selected = candidates[0]
    try:
        body = _download(selected['url'], selected.get('http_headers') or info.get('http_headers') or {}, bridge.MAX_BINARY)
    except RescueError: raise
    except (OSError,ValueError) as exc:
        raise RescueError('视频文件暂时无法下载，请上传原视频。','VIDEO_DOWNLOAD_FAILED',422) from exc
    title = re.sub(r'[\\/:*?"<>|]','_',str(info.get('title') or '链接视频'))[:100]
    public = bridge.receive_file(title+'.'+selected['ext'],body,body.getbuffer().nbytes)['file']
    with bridge._LOCK: row = bridge._FILES[public['id']]
    frames = bridge._jpeg_frames(row)
    if not frames:
        with bridge._LOCK: bridge._FILES.pop(public['id'],None)
        Path(row['path']).unlink(missing_ok=True)
        raise RescueError('已取得文件，但没有解码出有效画面；请上传原视频。','VIDEO_DECODE_FAILED',422)
    # OCR provides searchable evidence; it never substitutes for speech transcription.
    import base64
    texts=[]
    for index, frame in enumerate(frames):
        try: text = image_text(base64.b64decode(frame))[0].strip()
        except Exception: text = ''
        if text: texts.append('【采样画面 '+str(index+1)+' 文字】\n'+text[:5000])
    content='\n\n'.join(texts)
    with bridge._LOCK:
        row['cachedFrames']=frames
        row['content']=content
    note='已解码 '+str(len(frames))+' 张采样画面；语音尚未转写，未读取整段视频。'
    return {'ok':True,'source':'web','sourceType':'video-link','title':title,
        'content':content,'text':content,'chars':len(content),'url':url,
        'outline':[],'partial':True,'thin':not bool(content),'transcript':False,
        'uploadId':public['id'],'frames':len(frames),'note':note,
        'duration':row.get('duration'),'readingMode':'sampled-frames'}
