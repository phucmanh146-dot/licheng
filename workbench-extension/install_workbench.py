"""Install additive files in an existing local workbench, with a reversible backup."""
import argparse
import shutil
from datetime import datetime
from pathlib import Path

FILES = ['sy_wechat_search.py', 'growth_web_render.py', 'growth_materials.py', 'growth_obsidian.py', 'growth_models.py', 'growth_paths.py', 'growth_sources.py', 'growth_video.py', 'growth_web.py', 'growth_wechat.py', 'growth_analysis.py', 'growth_pipeline.py', 'growth_server.py', 'growth-workspace.js', 'growth-workspace.css',
         'growth_remote.py', 'sy_remote_bridge.py', 'sy_remote_entry.js', 'sy_remote_panel.html', 'sy_wechat_share.js', 'sy_wechat_select.js', 'sy_wechat_store.js', 'growth_ocr.py', 'growth_ocr.ps1', 'growth_wechat_screen.py', 'growth_wechat_float.py', 'launch_growth.py', 'start-remote.cmd', '启动资料行动.cmd']


def patch_reader(content):
    old = "selected=tag in ('article','main') or a.get('itemprop')"
    new = "selected=tag in ('article','main') or a.get('role') in ('main','article') or a.get('itemprop')"
    if old not in content and new not in content:
        raise ValueError('原网页正文读取器已更改，请先核对兼容性；未覆盖它。')
    content = content.replace(old, new)
    return content.replace("main'\nclass Article", "main,[role=\"main\"],[role=\"article\"]'\nclass Article")


def install(target):
    target = Path(target).resolve()
    if not (target / 'local_server.py').is_file() or not (target / 'index.html').is_file():
        raise ValueError('请选择包含 local_server.py 和 index.html 的原项目目录。')
    reader = target / 'sy_web_reader.py'
    reader_content = patch_reader(reader.read_text(encoding='utf-8-sig')) if reader.is_file() else None
    backup = target / ('.growth-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(exist_ok=False)
    for name in ['index.html', 'start-rescue.ps1', 'sy_web_reader.py', *FILES]:
        if (target / name).exists():
            shutil.copy2(target / name, backup / name)
    for name in FILES:
        source = Path(__file__).resolve().parent / name
        if source != target / name:
            shutil.copy2(source, target / name)
    index = target / 'index.html'
    content = index.read_text(encoding='utf-8-sig')
    if 'sy_remote_entry.js' not in content:
        if '</body>' not in content:
            raise ValueError('原首页缺少 body 结束标签，未修改。')
        content = content.replace('</body>', '<script src="./sy_remote_entry.js"></script>\n</body>')
    if 'growth-workspace.js' not in content:
        snippet = '\n<link rel="stylesheet" href="./growth-workspace.css">\n<script src="./growth-workspace.js"></script>\n'
        if '</body>' not in content:
            raise ValueError('原首页缺少 body 结束标签，未修改。')
        content = content.replace('</body>', snippet + '</body>')
    index.write_text(content, encoding='utf-8')
    starter = target / 'start-rescue.ps1'
    if starter.is_file():
        script = starter.read_text(encoding='utf-8-sig')
        if "'local_server.py'" in script:
            starter.write_text(script.replace("'local_server.py'", "'growth_server.py'"), encoding='utf-8-sig')
    if reader_content is not None:
        reader.write_text(reader_content, encoding='utf-8')
    print('Installed. Backup:', backup)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('target')
    install(parser.parse_args().target)
