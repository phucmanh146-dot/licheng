"""Windows local-only Obsidian vault picker; never uploads vault to cloud."""
import os,json
from pathlib import Path
from urllib.parse import urlencode
from rescue_service import RescueError
CFG=Path.home()/'.shanganya'/'vault_path.json'

def installed_vault():
    from pm_agent_bridge import find_vault
    root=find_vault()
    if root is not None:return root
    try:
        obj=json.loads(CFG.read_text(encoding='utf-8'))
        p=Path(obj.get('vault','')).resolve()
        return p if p.is_dir() and (p/'.obsidian').is_dir() else None
    except (OSError,ValueError,TypeError):return None

def choose_vault(path=None,interactive=False):
    if interactive:
        try:
            import tkinter
            from tkinter import filedialog
            root=tkinter.Tk();root.withdraw();root.wm_attributes('-topmost',True)
            initial=installed_vault()
            chosen=filedialog.askdirectory(title='选择 Obsidian 仓库（Vault）根目录',initialdir=str(initial or Path.home()))
            root.destroy()
            if not chosen:return {'ok':False,'cancelled':True,'note':'已取消选择，当前仓库没有更改。'}
            path=chosen
        except Exception as exc:raise RescueError('没有打开 Windows 文件夹选择器。请复制仓库路径到设置框。','FOLDER_PICKER_UNAVAILABLE',503) from exc
    p=Path(str(path or '')).expanduser().resolve()
    if not p.is_dir() or not (p/'.obsidian').is_dir():
        raise RescueError('请选择包含 .obsidian 子文件夹的 Obsidian 仓库根目录。','NOT_OBSIDIAN_VAULT',422)
    os.environ['FOCUS_VAULT_PATH']=str(p)
    CFG.parent.mkdir(exist_ok=True)
    CFG.write_text(json.dumps({'vault':str(p)},ensure_ascii=False),encoding='utf-8')
    return {'ok':True,'name':p.name,'path':str(p),'url':'obsidian://open?'+urlencode({'vault':p.name})}

def open_vault():
    root=installed_vault()
    if root is None:raise RescueError('还没有识别到知识库路径','VAULT_MISSING',422)
    if os.name=='nt':
        os.startfile('obsidian://open?'+urlencode({'vault':root.name}))
    return {'ok':True,'path':str(root),'name':root.name,'deepLink':'obsidian://open?'+urlencode({'vault':root.name})}

def reveal_in_explorer():
    root=installed_vault()
    if root is None:raise RescueError('找不到知识库目录','VAULT_MISSING',422)
    if os.name=='nt':os.startfile(str(root))
    return {'ok':True,'path':str(root)}

def vault_status():
    root=installed_vault()
    return {'connected':bool(root),'name':root.name if root else '',
            'path':str(root) if root else '',
            'url':'obsidian://open?'+urlencode({'vault':root.name}) if root else ''}


def reveal_note_in_explorer(relpath):
    import subprocess
    root=installed_vault()
    if root is None:raise RescueError('Obsidian 知识库未连接','VAULT_MISSING',422)
    if not isinstance(relpath,str) or not relpath or len(relpath)>600:
        raise RescueError('笔记路径不正确','INVALID_NOTE',400)
    target=(root/relpath.replace('\\','/')).resolve()
    if root not in target.parents or not target.is_file() or target.suffix.lower()!='.md':
        raise RescueError('指定笔记不在当前仓库内','INVALID_NOTE',400)
    if os.name=='nt':
        subprocess.Popen(['explorer.exe','/select,'+str(target)],close_fds=True)
    return {'ok':True,'vault':root.name,'path':str(target)}
