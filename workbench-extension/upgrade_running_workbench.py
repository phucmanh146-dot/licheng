"""Windows-only, scoped upgrade with a verified copy of this app's local data.

Run from the extension checkout/staging directory with the existing project path.
Leaves the original data directory intact. Never stops unrelated applications.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
from urllib.request import urlopen


def readonly(database):
    return sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)


def fingerprint(database):
    with closing(readonly(database)) as connection:
        if connection.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('Database integrity check failed; original data preserved.')
        rows = [connection.execute('SELECT * FROM ' + name + ' ORDER BY id').fetchall()
                for name in ('projects', 'runs')]
    return hashlib.sha256(json.dumps(rows, ensure_ascii=True).encode()).hexdigest(), [len(r) for r in rows]


def main(target):
    if os.name != 'nt':
        raise RuntimeError('This updater requires the Windows workbench.')
    import psutil
    import install_workbench
    root = Path(target).resolve()
    original = Path.home() / '.shanganya-growth'
    destination = root / '.growth-data'
    source = destination if destination.is_dir() else original
    configured = os.getenv('SHANGAN_GROWTH_DATA')
    if configured and Path(configured).resolve() != destination.resolve():
        raise RuntimeError('A custom data directory is configured; verify it before migration.')
    before, counts = fingerprint(source / 'workflow.sqlite3')
    with closing(readonly(source / 'workflow.sqlite3')) as connection:
        if connection.execute("SELECT count(*) FROM runs WHERE status IN ('queued','running')").fetchone()[0]:
            raise RuntimeError('Active workflow; update not started.')
    required = sum(p.stat().st_size for p in source.iterdir() if p.is_file()) + 20_000_000
    if shutil.disk_usage(root).free < required:
        raise RuntimeError('Target drive has insufficient space; update not started.')
    processes = {}
    for connection in psutil.net_connections(kind='tcp'):
        if connection.status != 'LISTEN' or not connection.laddr or connection.laddr.port not in (8877, 8878):
            continue
        process = psutil.Process(connection.pid)
        expected = root / ('growth_server.py' if connection.laddr.port == 8877 else 'sy_remote_bridge.py')
        if not any(Path(arg).resolve() == expected for arg in process.cmdline() if arg.endswith('.py')):
            raise RuntimeError('Port belongs to another application; update not started.')
        processes[process.pid] = process
    install_workbench.install(root)
    for process in processes.values():
        try:
            process.terminate()
            process.wait(timeout=5)
        except psutil.NoSuchProcess:
            pass
    # Verify the last committed data again after the services have stopped.
    before, counts = fingerprint(source / 'workflow.sqlite3')
    if not destination.exists():
        incoming = root / ('.growth-data-migration-' + time.strftime('%Y%m%d-%H%M%S'))
        incoming.mkdir()
        for file in source.iterdir():
            if file.is_file() and not file.name.startswith('workflow.sqlite3'):
                shutil.copy2(file, incoming / file.name)
        with closing(readonly(source / 'workflow.sqlite3')) as src, closing(sqlite3.connect(incoming / 'workflow.sqlite3')) as dst:
            src.backup(dst)
        if fingerprint(incoming / 'workflow.sqlite3')[0] != before:
            raise RuntimeError('Copied data does not match; original data preserved.')
        incoming.rename(destination)
    if fingerprint(destination / 'workflow.sqlite3')[0] != before:
        raise RuntimeError('Data verification failed; original data preserved.')
    temporary = root / '.growth-tmp'
    temporary.mkdir(exist_ok=True)
    environment = os.environ.copy()
    environment['TEMP'] = environment['TMP'] = str(temporary)
    environment['PYTHONIOENCODING'] = 'utf-8'
    started = []
    for script, logname in [('growth_server.py', 'server.log'), ('sy_remote_bridge.py', 'remote.log')]:
        with (destination / logname).open('ab') as output:
            process = subprocess.Popen([sys.executable, str(root / script)], cwd=root,
                stdout=output, stderr=output, env=environment, creationflags=subprocess.CREATE_NO_WINDOW)
        started.append(process.pid)
    ready = False
    for _ in range(30):
        try:
            with urlopen('http://127.0.0.1:8877/api/growth/health', timeout=1) as response:
                main_health = json.load(response)
            with urlopen('http://127.0.0.1:8878/health', timeout=1) as response:
                bridge_health = json.load(response)
            if main_health.get('ok') and bridge_health.get('ok'):
                ready = True
                break
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    print(json.dumps({'installed': True, 'ready': ready, 'pids': started,
        'dataRows': counts, 'oldCopyPreserved': original.exists(),
        'databaseUnchanged': fingerprint(destination / 'workflow.sqlite3')[0] == before}), flush=True)
    return 0 if ready else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('target')
    sys.exit(main(parser.parse_args().target))
