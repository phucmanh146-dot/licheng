"""Install files into one explicitly chosen existing vault; never enable plugins silently."""
import argparse
from datetime import datetime
from pathlib import Path
import shutil


def install(vault):
    vault = Path(vault).resolve()
    config = vault / '.obsidian'
    if not config.is_dir():
        raise ValueError('请选择实际 Obsidian 知识库；未找到 .obsidian 配置目录，未写入文件。')
    target = config / 'plugins' / 'shanganya-bridge'
    if target.exists():
        backup = config / ('shanganya-bridge-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
        shutil.copytree(target, backup)
    target.mkdir(parents=True, exist_ok=True)
    for name in ('main.js', 'manifest.json'):
        shutil.copy2(Path(__file__).parent / 'obsidian-bridge' / name, target / name)
    print('Bridge files installed. 在 Obsidian 的第三方插件中启用“上岸鸭 Bridge”，再回原工作台点击“打开我的 Obsidian”。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('vault')
    install(parser.parse_args().vault)
