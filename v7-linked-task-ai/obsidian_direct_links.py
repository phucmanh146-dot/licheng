"""Read-only full-text search and document links for the local Obsidian vault."""
import re
from pathlib import Path
from urllib.parse import urlencode,urlsplit
import pm_agent_bridge as pm
_CACHE={}
def _notes():
    root=pm.find_vault()
    if root is None:return None,[]
    rows=[]
    for p in root.rglob('*.md'):
        rel=p.relative_to(root)
        if any(part.startswith('.') for part in rel.parts):continue
        try:
            if not p.resolve().is_relative_to(root.resolve()) or p.stat().st_size>1024*1024:continue
            rows.append((rel.as_posix(),p))
        except OSError:continue
    return root,sorted(rows,key=lambda x:x[0].casefold())
def _text(p):
    stat=p.stat();key=str(p);stamp=(stat.st_mtime_ns,stat.st_size)
    old=_CACHE.get(key)
    if old and old[0]==stamp:return old[1]
    value=p.read_text('utf-8-sig',errors='replace')
    _CACHE[key]=(stamp,value)
    return value
def _uri(root,path):
    return 'obsidian://open?'+urlencode({'vault':root.name,'file':path})
def _query_terms(query):
    raw=str(query or '').casefold()
    chunks=re.findall(r'[a-z0-9][a-z0-9_+.-]*|[\u4e00-\u9fff]+',raw)
    stop={'这个','那个','怎么','如何','可以','我们','你们','好不','不好','一下','帮我','请你','进行','然后','什么','哪些','一下','已经','希望','需要'}
    terms=[]
    for chunk in chunks:
        if re.fullmatch(r'[\u4e00-\u9fff]+',chunk):
            if len(chunk)==2:candidates=[chunk]
            else:candidates=[chunk[i:i+2] for i in range(len(chunk)-1)]
        else:candidates=[chunk] if len(chunk)>=2 else []
        for term in candidates:
            if term not in stop and term not in terms:terms.append(term)
    # Keep a bounded, diverse set; include later terms as well as the first ones.
    if len(terms)>28:
        terms=terms[:14]+terms[-14:]
    return terms

def catalog(query=''):
    root,notes=_notes()
    if root is None:return {'ok':False,'connected':False,'notes':[],'error':'本机知识库未识别'}
    words=_query_terms(query);matches=[]
    for rel,p in notes:
        try:body=_text(p) if words else ''
        except OSError:continue
        combined=(rel+'\n'+body).casefold()
        hits=[w for w in words if w in combined]
        if words and not hits:continue
        snippets=[]
        for word in sorted(hits,key=lambda w:(w not in rel.casefold(),-len(w))):
            at=body.casefold().find(word)
            if at>=0:
                snippets.append(body[max(0,at-65):at+len(word)+150].strip())
            if len(snippets)>=3:break
        score=sum(15 if w in rel.casefold() else 1 for w in hits)+len(hits)*2
        matches.append({'path':rel,'title':p.stem,'url':_uri(root,rel),
                        'snippets':snippets,'score':score,'matchedTerms':len(hits)})
    matches.sort(key=lambda n:(-n['score'],-n['matchedTerms'],n['path']))
    return {'ok':True,'connected':True,'name':root.name,'path':str(root),
            'total':len(notes),'matched':len(matches),'notes':matches[:500]}
def document_links(path):
    note=pm.read_note(path)
    root,notes=_notes()
    body=note['content'];links=[];invalid=[];seen=set()
    def put(label,url,kind='web'):
        url=url.strip().rstrip('.,，。；;')
        if url in seen:return
        seen.add(url)
        try:
            parsed=urlsplit(url)
            good=parsed.scheme in ('http','https','obsidian') and bool(parsed.netloc)
            good=good and not parsed.username and not parsed.password
        except ValueError:good=False
        placeholder=bool(re.search(r'BV[xX]{3,}|example\.(?:com|org)|your[-_](?:url|domain)',url,re.I))
        if not good or placeholder:
            invalid.append({'label':label,'url':url,'reason':'占位地址或链接格式不完整'});return
        links.append({'label':label or url,'url':url,'kind':kind,'verified':False})
    for m in re.finditer(r'(?<!!)\[([^\]\n]+)\]\((https?://[^\s)]+|obsidian://[^\s)]+)(?:\s+["\'][^)]*)?\)',body):
        put(m.group(1),m.group(2))
    for m in re.finditer(r'https?://[^\s<>\]\)）"\'\x60]+|obsidian://[^\s<>\]\)）"\'\x60]+',body):
        put(m.group(0),m.group(0))
    byrel={rel.casefold():rel for rel,_ in notes};bystem={}
    for rel,p in notes:bystem.setdefault(p.stem.casefold(),[]).append(rel)
    for m in re.finditer(r'(?<!!)\[\[([^\]\n]+)\]\]',body):
        value=m.group(1);target=value.split('|',1)[0].split('#',1)[0].strip()
        label=value.split('|',1)[-1]
        if not target:continue
        rel=target if target.endswith('.md') else target+'.md'
        parent=Path(path).parent.as_posix()
        found=byrel.get(rel.casefold()) or byrel.get((parent+'/'+rel).casefold())
        choices=bystem.get(Path(target).stem.casefold(),[])
        if not found and len(choices)==1:found=choices[0]
        if found:put(label,_uri(root,found),'obsidian')
        else:invalid.append({'label':label,'reason':'笔记不存在或同名，请确认目标'})
    note.update({'url':_uri(root,note['path']),'links':links,'unresolved':invalid})
    return note
