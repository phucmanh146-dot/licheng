"""Read-only source migration with dry-run, hash manifest and transaction rollback.

Usage: migrate_shared.py --agent path --workflow path [--apply]
Target is SHANGAN_DATABASE_URL, never either source database. No name-based merges.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
import uuid
os.environ["SHANGAN_SKIP_DB_INIT"] = "1"
import platform_store as store
import team_orchestrator as team
import artifact_store
import shared_database

TABLES = {'runs','events','routes','revisions','agent_tool_calls','team_projects','team_history',
          'team_artifacts','artifact_blobs','team_ai_runs','team_session_bindings','cc_windows'}


def inspect(path):
    source = sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro', uri=True)
    source.row_factory = sqlite3.Row
    return source


def migrate(agent_path=None, workflow_path=None, apply=False):
    if not os.getenv('SHANGAN_DATABASE_URL'):
        raise ValueError('迁移目标必须明确配置为PostgreSQL；不会写回SQLite源文件')
    manifest = {'sources':[], 'tables':{}, 'workflow_projects':[]}
    sources = []
    try:
        for kind, path in [('agent', agent_path), ('workflow', workflow_path)]:
            if not path:
                continue
            source = inspect(path); sources.append((kind, source))
            # Logical snapshot hash includes committed WAL contents.
            digest = hashlib.sha256()
            for statement in source.iterdump():
                digest.update(statement.encode('utf-8'))
            manifest['sources'].append({'kind':kind,'path':str(Path(path).resolve()), 'sha256':digest.hexdigest()})
            for row in source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
                name = row['name']
                if name in TABLES or name == 'workflows':
                    manifest['tables'][kind+':'+name] = source.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]
        digest = hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()
        manifest['migration_id'] = digest
        if not apply:
            return {**manifest,'status':'DRY_RUN','source_unchanged':True}
        team.agent.init_database()
        store.init()
        with team.connection() as c:
            team.init(c); artifact_store.init(c)
        with team.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            if c.execute('SELECT source_hash FROM platform_migrations WHERE source_hash=?',(digest,)).fetchone():
                return {**manifest,'status':'ALREADY_IMPORTED'}
            for kind, source in sources:
                names = [r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type='table'")]
                if kind == 'agent':
                    for name in sorted(set(names)&TABLES):
                        schema = source.execute('SELECT sql FROM sqlite_master WHERE name=?',(name,)).fetchone()[0]
                        c.execute(schema.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1))
                        columns = [r[1] for r in source.execute('PRAGMA table_info("'+name+'")')]
                        for row in source.execute('SELECT * FROM "'+name+'"'):
                            # Existing IDs conflict instead of silently replacing versions.
                            sql = 'INSERT INTO '+name+'('+','.join(columns)+') VALUES('+','.join('?' for _ in columns)+')'
                            c.execute(sql, tuple(row))
                elif 'workflows' in names:
                    for old_id, body in source.execute('SELECT project,body FROM workflows'):
                        pid = uuid.uuid5(uuid.NAMESPACE_URL,digest+':workflow:'+old_id).hex
                        state = json.loads(body)
                        project = {'schema_version':'0.1','project_id':pid,'version':1,
                            'goal':state.get('context',{}).get('goal') or '迁入科研项目 '+old_id,
                            'mode':'live','timezone':'Asia/Shanghai','diagnosis':None,'plan':None,'proposal':None,
                            'feedback':[],'live_verified':False,'legacy_workflow':state,
                            'migration_source':{'source_project_id':old_id,'migration_id':digest},'updated_at':team.agent.now()}
                        c.execute('INSERT INTO team_projects VALUES(?,?,?)',(pid,1,team.agent.dump(project)))
                        c.execute('INSERT INTO team_history VALUES(?,?,?,?,?)',(pid,1,team.agent.dump(project),'导入旧科研记录；原状态保留，未冒充新模型验收',team.agent.now()))
                        manifest['workflow_projects'].append({'old_id':old_id,'project_id':pid})
            c.execute('INSERT INTO platform_migrations VALUES(?,?,?)',(digest,team.agent.dump(manifest),time.time()))
        return {**manifest,'status':'IMPORTED','source_unchanged':True,
                'next':'核查历史、材料和数量后，用platform_admin grant分配真实账号；旧服务停写与切换另行确认。'}
    finally:
        for _, source in sources:
            source.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--agent'); parser.add_argument('--workflow'); parser.add_argument('--apply',action='store_true')
    args = parser.parse_args()
    print(json.dumps(migrate(args.agent,args.workflow,args.apply),ensure_ascii=False,indent=2))
