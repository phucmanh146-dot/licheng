"""Add the navigator to an existing workbench without replacing its server or data."""
import json
import os
import py_compile
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parent
report = {'stage': 'preflight'}
try:
    for filename in ('agent_schedule.py', 'agent_day.py', 'learning_agent.py', 'agent_video.py', 'learning_agent_server.py'):
        py_compile.compile(str(root / filename), doraise=True)
    url = 'http://127.0.0.1:8901/api/agent/health'
    existing = None
    try:
        with urlopen(url, timeout=3) as r:
            existing = json.load(r)
    except Exception:
        pass
    if existing and existing.get('version') == 'learning-agent-1':
        report.update(stage='running', reused=True, health=existing)
    else:
        log = open(root / 'learning-agent-server.log', 'a', encoding='utf-8')
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        proc = subprocess.Popen([sys.executable, str(root / 'learning_agent_server.py'), '--port', '8901'],
                                cwd=str(root), stdout=log, stderr=log, creationflags=flags)
        (root / '.learning-agent-server.pid').write_text(str(proc.pid), encoding='utf-8')
        for attempt in range(25):
            time.sleep(.8)
            try:
                with urlopen(url, timeout=2) as r:
                    health = json.load(r)
                if health.get('version') == 'learning-agent-1':
                    report.update(stage='running', pid=proc.pid, health=health)
                    break
            except Exception:
                pass
        else:
            raise RuntimeError('8901 启动未成功；请查看 learning-agent-server.log')
    report['url'] = 'http://127.0.0.1:8901/learning-agent.html'
    index = root / 'index.html'
    if index.is_file():
        content = index.read_text(encoding='utf-8-sig')
        if 'learning-agent-entry.js' not in content:
            backup = root / 'backup-learning-agent-20261008'
            backup.mkdir(exist_ok=True)
            if not (backup / 'index.html').exists():
                shutil.copy2(index, backup / 'index.html')
            if '</body>' not in content:
                raise ValueError('原首页缺少 body 结束标签，未修改')
            updated = content.replace('</body>', '<script defer src="./learning-agent-entry.js"></script></body>', 1)
            tmp = root / 'index.html.learning-agent.tmp'
            tmp.write_text(updated, encoding='utf-8')
            os.replace(tmp, index)
            report['homepageEntry'] = 'added'
except Exception as exc:
    report.update(stage='failed', error=str(exc))
finally:
    (root / 'learning-agent-install-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
if report['stage'] != 'running':
    sys.exit(1)
