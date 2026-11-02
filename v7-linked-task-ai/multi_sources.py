"""Visitor-scoped web retrieval adapters; secrets are kept in process memory."""
import os,re,json,time,hashlib,threading
from urllib.parse import urlsplit,quote_plus
from concurrent.futures import ThreadPoolExecutor
import requests
from rescue_service import search_web,extract,validate_url,RescueError,is_video_url
_LOCK=threading.RLock()
_CLOUD_READER=requests.Session()
CONFIG={'provider':'public','key':'','endpoint':'','verified':False,'readerKey':''}
def status():
 with _LOCK:return {'provider':CONFIG['provider'],'hasKey':bool(CONFIG['key']),'endpoint':CONFIG['endpoint'],'verified':CONFIG['verified'],'hasReaderKey':bool(CONFIG.get('readerKey'))}
def configure(data):
 provider=str(data.get('provider','public'))
 if provider not in ('public','tavily','brave','custom'):raise ValueError('不支持的搜索服务')
 key=str(data.get('key','')).strip()
 if len(key)>8192 or '\n' in key or '\r' in key:raise ValueError('密钥格式无效')
 endpoint=str(data.get('endpoint','')).strip()
 if provider=='custom':
  validate_url(endpoint)
  if urlsplit(endpoint).scheme!='https':raise ValueError('自定义API需要HTTPS')
 if provider!='public' and not key:raise ValueError('请填写你自己的搜索API密钥')
 reader_key=str(data.get('readerKey','')).strip()
 if len(reader_key)>8192 or '\n' in reader_key or '\r' in reader_key:raise ValueError('Reader密钥格式无效')
 with _LOCK:CONFIG.update(provider=provider,key=key,endpoint=endpoint if provider=='custom' else '',verified=False,readerKey=reader_key)
 return status()
def clean(rows,n):
 out=[];seen=set()
 for row in rows:
  if not isinstance(row,dict):continue
  url=str(row.get('url',''))
  try:
   u=urlsplit(url)
   if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:continue
  except ValueError:continue
  if url in seen:continue
  seen.add(url);text=str(row.get('content') or row.get('snippet') or row.get('description') or '')[:5000]
  out.append({'title':str(row.get('title') or u.hostname)[:300],'url':url,'text':text,'snippet':text,'readStatus':'search-snippet'})
  if len(out)>=n:break
 return out
def search(query,n=5):
 query=str(query).strip()[:350]
 if not query:raise ValueError('先填写关键词或问题')
 n=max(1,min(8,int(n)))
 with _LOCK:cfg=dict(CONFIG)
 provider=cfg['provider']
 if provider=='public':
  found=search_web(query,n);rows=clean(found.get('results',[]),n);name=found.get('provider','公共搜索')
 else:
  if provider=='tavily':
   endpoint='https://api.tavily.com/search';headers={'Authorization':'Bearer '+cfg['key']};method='POST';body={'query':query,'max_results':n,'search_depth':'basic','include_answer':False};params=None
  elif provider=='brave':
   endpoint='https://api.search.brave.com/res/v1/web/search';headers={'X-Subscription-Token':cfg['key'],'Accept':'application/json'};method='GET';body=None;params={'q':query,'count':n}
  else:
   endpoint=cfg['endpoint'];validate_url(endpoint);headers={'Authorization':'Bearer '+cfg['key'],'Accept':'application/json'};method='POST';body={'query':query,'max_results':n};params=None
  response=requests.request(method,endpoint,headers=headers,json=body,params=params,timeout=25,allow_redirects=False)
  if response.status_code>=300:raise RescueError('搜索API返回HTTP '+str(response.status_code)+'，请检查密钥、余额和权限。','SEARCH_API_ERROR',502)
  if len(response.content)>4000000:raise ValueError('搜索响应过大')
  data=response.json();raw=data.get('web',{}).get('results',[]) if provider=='brave' else data.get('results',[])
  rows=clean(raw,n);name=provider
 if not rows:raise RescueError('搜索没有返回可用链接，不能计为读取成功。','SEARCH_EMPTY',503)
 with _LOCK:
  if CONFIG['provider']==provider:CONFIG['verified']=True
 return {'query':query,'results':rows,'provider':name,'checkedAt':time.time()}
def read(url):
 url=str(url).strip()[:2048];validate_url(url)
 host=(urlsplit(url).hostname or '').lower()
 protected=host=='feishu.cn' or host.endswith('.feishu.cn') or host=='larksuite.com' or host.endswith('.larksuite.com')
 try:
  if os.environ.get('SHANGANYA_NATIVE_SOURCE_PROXY')=='1':
   r=requests.post('http://127.0.0.1:8892/api/source/prepare',json={'url':url},timeout=90);d=r.json()
   if not r.ok or d.get('error'):raise ValueError((d.get('error') or '原项目读取失败')+(' '+d['how'] if d.get('how') else ''))
  else:d=extract(url)
 except Exception as exc:
  if protected or is_video_url(url):raise ValueError(str(exc)) from None
  d={'text':'','thin':True}
 text=str(d.get('text') or d.get('content') or '')
 if len(text.strip())<100 or d.get('thin'):
  if is_video_url(url):raise ValueError('视频正文需要字幕或转写，不能用页面简介冒充')
  host=(urlsplit(url).hostname or '').lower()
  if protected:raise ValueError('飞书没有返回足够正文，请检查应用权限及文档访问授权')
  # Public dynamic pages only; no user credentials are relayed to the Reader service.
  reader_headers={'Accept':'text/plain','X-Respond-With':'markdown'}
  with _LOCK:reader_key=CONFIG.get('readerKey','')
  if reader_key:reader_headers['Authorization']='Bearer '+reader_key
  try:
   r=requests.get('https://r.jina.ai/'+url,headers=reader_headers,timeout=(7,30),allow_redirects=False)
  except requests.RequestException:
   if os.environ.get('SHANGANYA_NATIVE_SOURCE_PROXY')=='1':
    cloud='https://shanganya-full-public-20261017-production.up.railway.app'
    try:
     if reader_key:
      configured=_CLOUD_READER.post(cloud+'/api/sources/config',json={'provider':'public','readerKey':reader_key},timeout=20)
      if not configured.ok:raise ValueError('云端Reader连接未配置成功')
     response=_CLOUD_READER.post(cloud+'/api/sources/read',json={'url':url},timeout=65)
     document=response.json()
     if not response.ok or document.get('readStatus')!='fulltext':raise ValueError(document.get('error') or '云端正文未取得')
     return document
    except requests.RequestException:raise ValueError('本机及本站云端正文服务暂不可达，请重试') from None
   raise ValueError('正文API暂时连接失败，请重试或配置Reader密钥') from None
  if r.status_code!=200:raise ValueError('网页正文API返回HTTP '+str(r.status_code)+'；请打开原链接核验')
  if len(r.content)>4000000:raise ValueError('网页正文响应过大')
  raw=r.text
  if re.search(r'Warning: Target URL returned error [45][0-9]{2}',raw):raise ValueError('原网页返回错误，未取得可用正文')
  text=raw.split('Markdown Content:',1)[-1].strip()
  title=re.search(r'^Title:\s*(.*)',raw,re.M)
  d={'title':title.group(1) if title else url,'provider':'Jina Reader'}
 if len(text.strip())<100 or re.search(r'^(?:enable javascript|javascript is required|verify you are human|access denied)',text.strip(),re.I):raise ValueError('只返回加载页或过少文字，未取得可用正文')
 result={key:d[key] for key in ('outline','links','linkedSources','sourceKind','outlineComplete','note','sourcePath') if key in d}
 result.update(title=str(d.get('title') or url)[:300],url=url,text=text[:80000],chars=len(text),partial=bool(d.get('partial') or d.get('truncated') or len(text)>80000),readStatus='fulltext',truncated=len(text)>80000)
 return result
def collect(data):
 query=str(data.get('query','')).strip()[:350];urls=data.get('urls',[])
 if not isinstance(urls,list):raise ValueError('链接格式无效')
 rows=[];warnings=[];provider=''
 if data.get('web') and query:
  try:
   found=search(query,5);rows=found['results'];provider=found['provider']
  except Exception as e:warnings.append(str(e))
 direct=[]
 for url in urls[:4]:
  try:validate_url(str(url));direct.append(str(url))
  except Exception as e:warnings.append('链接未读取：'+str(e))
 targets=list(dict.fromkeys(direct+[r['url'] for r in rows[:2]]))[:6]
 def attempt(url):
  try:return read(url),None
  except Exception as e:return None,'未读取 '+url+'：'+str(e)
 with ThreadPoolExecutor(max_workers=3) as pool:
  for target,(doc,error) in zip(targets,pool.map(attempt,targets)):
   if error:
    warnings.append(error)
    if target in direct and not any(r['url']==target for r in rows):rows.append({'title':target,'url':target,'text':'','readStatus':'failed'})
   else:
    rows=[r for r in rows if r['url']!=target];rows.append(doc)
 sources=rows[:10]
 context='\n\n'.join('['+str(i+1)+'] '+r['title']+'\n原链接：'+r['url']+'\n读取状态：'+r['readStatus']+'\n'+r.get('text','')[:2400] for i,r in enumerate(sources) if r.get('text'))
 return {'sources':sources,'context':context[:12500],'warnings':warnings,'provider':provider,'readCount':sum(r.get('readStatus')=='fulltext' for r in sources),'checkedAt':time.time()}
def check(data):
 kind=data.get('kind','query');value=str(data.get('value','')).strip()
 if kind=='url':
  result=read(value);rows=[result];raw=re.sub(r'\s+',' ',result['text']).strip()
 else:
  result=search(value,6);rows=result['results'];raw=json.dumps(sorted((r['url'],r['title'],r['text'][:600]) for r in rows),ensure_ascii=False)
 digest=hashlib.sha256(raw.encode('utf-8')).hexdigest();old=str(data.get('previousHash',''))
 return {'hash':digest,'baseline':not bool(old),'changed':bool(old and old!=digest),'sources':rows,'checkedAt':time.time()}
def dispatch(path,data=None):
 if path=='/api/sources/wechat':
  if os.environ.get('SHANGANYA_NATIVE_SOURCE_PROXY')!='1':raise ValueError('此网页尚未接入你的微信设备；没有读取你的私人聊天。')
  from sy_wechat_reader import api as wechat_api
  payload=data or {};route=str(payload.get('path',''))
  if route not in ('/status','/wechat/search','/wechat/open','/wechat/preview','/wechat/history-status','/wechat/history-groups','/wechat/history'):raise ValueError('微信读取操作无效')
  result=wechat_api(str(payload.get('method','POST')),route,payload.get('data') or {})
  result['checkedAt']=time.time()
  return result
 if path=='/api/sources/status':return status()
 data=data or {}
 if path=='/api/sources/config':return configure(data)
 if path=='/api/sources/search':return search(data.get('query',''),data.get('limit',5))
 if path=='/api/sources/collect':return collect(data)
 if path=='/api/sources/read':return read(data.get('url',''))
 if path=='/api/sources/check':return check(data)
 raise ValueError('接口不存在')
