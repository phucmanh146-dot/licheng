"""Run standalone or alongside the existing 上岸鸭 V9 files on loopback."""
import argparse
import json
import os
import mimetypes
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import learning_agent as agent
import rescue_service as rescue
import team_orchestrator as team
import team_sessions
import team_runtime
import team_intervention
import team_evidence_score
import team_dispatch as dispatch
import team_handoff as handoff
import team_rescue
import team_recovery
import artifact_store
import team_inputs
import team_revision
import cc_progress
import research_companion

ROOT = Path(__file__).resolve().parent
try:
    from v9_server import V9Handler as LegacyHandler
except ImportError:
    LegacyHandler = SimpleHTTPRequestHandler
    try:
        from local_integrations import initialize
        initialize()
    except ImportError:
        pass


class Handler(LegacyHandler):
    def __init__(self, *args, **kwargs):
        if LegacyHandler is SimpleHTTPRequestHandler:
            kwargs['directory'] = str(ROOT)
        super().__init__(*args, **kwargs)

    def agent_allowed(self):
        host = self.headers.get('Host', '')
        hosts = {'127.0.0.1:' + str(self.server.server_port), 'localhost:' + str(self.server.server_port)}
        origin = self.headers.get('Origin')
        return host in hosts and (origin is None or origin in {'http://' + h for h in hosts})

    def send_json(self, obj, status=200):
        raw = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def do_GET(self):
        if not self.agent_allowed():
            return self.send_json({'error': '来源不允许'}, 403)
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == '/api/agent/health':
                import shutil, importlib.util
                return self.send_json({'ok': True, 'version': 'learning-agent-1', 'ai': rescue.public_config(),
                                       'search':{'provider':'Tavily' if os.getenv('TAVILY_API_KEY') else 'public-fallback',
                                                 'verified':False, 'note':'有配置不代表检索已成功；请查看每次执行记录。'},
                                       'capabilities': {'liveSearch': True, 'sourceReading': True, 'persistedRoutes': True,
                                                        'replan': True, 'ccProgress': True,
                                                        'taskRecovery': True, 'observedAttempts': True,
                                                        'videoRenderer': bool(shutil.which('ffmpeg') and importlib.util.find_spec('PIL'))}})
            if path == '/api/agent/team/cc-board':
                identifier = parse_qs(parsed.query).get('id', [''])[0]
                if not identifier:
                    raise ValueError('请提供项目 id')
                return self.send_json(cc_progress.board(team.state(identifier)))
            if path == '/api/agent/team':
                return self.send_json(team.state(parse_qs(parsed.query).get('id', [None])[0]))
            if path == '/api/agent/team/research-today':
                identifier = parse_qs(parsed.query).get('id', [''])[0]
                if not identifier:
                    raise ValueError('请提供项目 id')
                return self.send_json(research_companion.today(identifier))
            if path in ('/api/agent/team/interventions', '/api/agent/team/evidence-score'):
                identifier = parse_qs(parsed.query).get('id', [''])[0]
                if not identifier:
                    raise ValueError('请提供项目 id')
                p = team.state(identifier)
                return self.send_json(team_intervention.report(p) if path.endswith('/interventions') else team_evidence_score.report(p))
            if path == '/api/agent/team/runtime':
                identifier = parse_qs(parsed.query).get('id', [''])[0]
                if not identifier:
                    raise ValueError('请提供项目 id')
                return self.send_json(team_runtime.snapshot(team.state(identifier)))
            if path in ('/api/agent/team/recovery-agenda', '/api/agent/team/recovery-context', '/api/agent/team/recovery-export'):
                query = parse_qs(parsed.query)
                p = team.state(query.get('id', [''])[0])
                if path.endswith('recovery-agenda'):
                    return self.send_json(team_recovery.agenda(p, query.get('member_id', [''])[0], int(query.get('minutes', ['30'])[0])))
                if path.endswith('recovery-context'):
                    return self.send_json(team_recovery.context_packet(p, query.get('task_id', [''])[0], query.get('action_id', [''])[0]))
                return self.send_json(team_recovery.evaluation_export(p))
            if path == '/api/agent/team/handoff':
                identifier = parse_qs(parsed.query).get('id', [''])[0]
                if not identifier:
                    raise ValueError('请提供待复核项目的 id')
                return self.send_json(handoff.review_request(team.state(identifier), include_documents=True))
            if path == '/api/agent/team/artifact':
                query = parse_qs(parsed.query)
                p = team.state(query.get('id', [''])[0])
                return self.send_json(artifact_store.read(p, query.get('artifact_id', [''])[0], int(query.get('artifact_version', ['0'])[0])))
            if path == '/api/agent/team/trace':
                import team_ai
                query = parse_qs(parsed.query)
                return self.send_json(team_ai.read_trace(query.get('id',[''])[0],query.get('run_id',[''])[0]))
            if path == '/api/agent/state':
                return self.send_json(agent.state())
            if path == '/api/agent/run':
                return self.send_json(agent.get_run(parse_qs(parsed.query).get('id', [''])[0]))
            if path.startswith('/api/agent/video/'):
                name = path.rsplit('/', 1)[-1]
                if not re.fullmatch(r'[0-9a-f]{32}-v\d+\.mp4', name):
                    raise ValueError('视频地址无效')
                target = agent.DATA / 'videos' / name
                if not target.is_file():
                    return self.send_json({'error': '视频不存在'}, 404)
                raw = target.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
            if path == '/api/ai-config':
                return self.send_json(rescue.public_config())
            if path in ('/', '/learning-agent'):
                self.path = '/learning-agent.html'
            if path.startswith('/api/agent/'):
                return self.send_json({'error': '接口不存在'}, 404)
            if LegacyHandler is SimpleHTTPRequestHandler:
                allowed = ('/planner.html', '/planner.js', '/planner-refinements.js', '/learning-agent.html',
                           '/learning-agent.js', '/learning-agent.css', '/learning-agent-entry.js', '/team.html',
                           '/team.js', '/team-handoff.js', '/team-inputs.js', '/team-progress-dashboard.html',
                           '/team-progress-dashboard.js')
                allowed += ('/team-recovery.js',)
                allowed += ('/team-runtime.js',)
                allowed += ('/team-intervention.js',)
                allowed += ('/research-companion.js',)
                if self.path.split('?')[0] not in allowed:
                    return self.send_json({'error': '文件不可读取'}, 404)
            return super().do_GET()
        except ValueError as exc:
            return self.send_json({'error': str(exc)}, 400)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        ours = path.startswith('/api/agent/') or path in ('/api/ai-config', '/api/ai-test', '/api/ai-local-gateway')
        if not ours and LegacyHandler is not SimpleHTTPRequestHandler:
            return super().do_POST()
        if not self.agent_allowed():
            return self.send_json({'error': '来源不允许'}, 403)
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            return self.send_json({'error': '需要 JSON 请求'}, 415)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 1 <= size <= 4_000_000:
                return self.send_json({'error': '请求超过 4 MB 上限'}, 413)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('请求必须为 JSON 对象')
            if path.startswith('/api/agent/planner/') and path.rsplit('/',1)[-1] in ('split','lock','calibrate','reconcile','alternatives'):
                import b_refinements as b
                op=path.rsplit('/',1)[-1]
                d,p,v=data['diagnosis'],data['plan'],data['expected_plan_version']
                if op=='split':value=b.split(d,p,data['task_id'],v,data.get('wait_minutes',0))
                elif op=='lock':value=b.lock(d,p,data['task_id'],data['locked'],v)
                elif op=='calibrate':value=b.calibrate(d,p,v)
                elif op=='reconcile':value=b.reconcile(d,data['new_diagnosis'],p,data.get('context',{}),v)
                else:value=b.alternatives(d,p,data['settings'],v,data.get('optional_ids'),data.get('extension_days',0))
                return self.send_json(value)
            if path == '/api/agent/planner/validate':
                import action_planner
                action_planner.validate(data['plan'], data['diagnosis'])
                return self.send_json(data['plan'])
            if path == '/api/agent/planner/edit':
                import action_planner
                return self.send_json(action_planner.edit(data['diagnosis'],data['plan'],data['task_id'],data['patch'],data['expected_plan_version']))
            if path == '/api/agent/planner/feedback':
                import action_planner
                return self.send_json(action_planner.feedback(data['diagnosis'],data['plan'],data['task_id'],data['actual_minutes'],data['remaining_minutes'],data['expected_plan_version']))
            if path == '/api/agent/planner/generate':
                import action_planner
                return self.send_json(action_planner.generate(data['diagnosis'], data.get('context', {})))
            if path == '/api/agent/planner/replan':
                import action_planner
                return self.send_json(action_planner.replan(data['diagnosis'], data['plan'], data['settings'], data['expected_plan_version']))
            if path.startswith('/api/agent/team/'):
                operation = path.rsplit('/',1)[-1]
                handlers = {'research-save':research_companion.save,
                            'research-checkin':research_companion.checkin,
                            'intervention-checkin':team_intervention.checkin,
                            'intervention-respond':team_intervention.respond,
                            'intervention-feedback':team_intervention.feedback,
                            'recover':team_sessions.recover,'recover-confirm':team_sessions.confirm,
                            'runtime-focus':team_runtime.focus,'create':team.create,'diagnosis':team.diagnosis,'propose':team.propose,
                            'apply':team.apply,'feedback':team.feedback,'demo':team.demo,
                            'period-replan':team.period_replan,'undo-plan':team.undo_plan,
                            'dispatch':dispatch.dispatch,'brief':dispatch.brief,
                            'handoff-check':handoff.check,'generate-b':handoff.generate,
                            'review-receive':handoff.receive_review,'review-run':handoff.invoke_review,
                            'context':team_inputs.save_context,'member':team_inputs.save_member,
                            'capability':team_inputs.record_capability,'artifact-import':artifact_store.import_file,
                            'advance-review':team_revision.advance,
                            'rescue-start':team_rescue.start,'rescue-sync':team_rescue.sync,
                            'recovery-pause':team_recovery.pause,'recovery-condition':team_recovery.signal,
                            'recovery-resume':team_recovery.resume,'recovery-attempt':team_recovery.attempt,
                            'recovery-commitment':team_recovery.commitment,'recovery-checkin':team_recovery.checkin,
                            'cc-register':cc_progress.register,'cc-heartbeat':cc_progress.heartbeat}
                if operation not in handlers:
                    return self.send_json({'error':'团队接口不存在'},404)
                return self.send_json(handlers[operation](data))
            if path == '/api/agent/run':
                return self.send_json(agent.submit(data), 202)
            if path == '/api/agent/replan':
                return self.send_json(agent.replan(data, save=data.get('apply') is True))
            if path == '/api/agent/complete':
                return self.send_json(agent.complete_task(data))
            if path == '/api/agent/day':
                return self.send_json(agent.daily_plan(data))
            if path == '/api/agent/action':
                return self.send_json(agent.complete_action(data))
            if path == '/api/agent/undo':
                return self.send_json(agent.undo(data))
            if path == '/api/agent/tutorial':
                from agent_video import render
                return self.send_json(render(str(data.get('routeId', ''))))
            if path == '/api/ai-config':
                return self.send_json(rescue.set_config(data))
            if path == '/api/ai-test':
                return self.send_json(rescue.test_connection())
            if path == '/api/ai-local-gateway':
                from hermes_gateway import connect_local_gateway
                value = connect_local_gateway()
                if value is None:
                    raise ValueError('本机模型网关暂时不可用，请在 AI 连接中设置服务')
                return self.send_json(value)
            return self.send_json({'error': '接口不存在'}, 404)
        except team.Conflict as exc:
            return self.send_json({'error':str(exc)},409)
        except rescue.RescueError as exc:
            return self.send_json({'error': str(exc), 'code': exc.code, **exc.extra}, exc.status)
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            return self.send_json({'error': str(exc)}, 400)
        except Exception as exc:
            return self.send_json({'error': '请求未完成：' + type(exc).__name__}, 502)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8901)
    parser.add_argument('--with-b-planner', action='store_true', help='Bind the delivered deterministic B planner; A remains independently configured')
    parser.add_argument('--with-team-ai', action='store_true', help='Bind actual stored-material diagnosis and review to the configured model, plus B remaining-work planning')
    parser.add_argument('--with-local-gateway', action='store_true', help='Explicitly connect and test the existing local Hermes gateway')
    parser.add_argument('--open-team', action='store_true', help='Open the team page after the server socket is ready')
    args = parser.parse_args()
    if args.with_b_planner:
        dispatch.PLANNER = handoff.planner
    if args.with_team_ai:
        import team_ai
        team_ai.bind()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    if args.with_local_gateway:
        from hermes_gateway import connect_local_gateway
        try:
            connected = connect_local_gateway()
        except OSError:
            connected = None
        print('本机 AI 已连接并完成文本请求验证' if connected else '本机 AI 暂未连接，可在 AI 连接中重试', flush=True)
    print(f'上岸鸭学习导航 Agent: http://127.0.0.1:{args.port}/learning-agent.html', flush=True)
    if args.open_team:
        import webbrowser
        webbrowser.open(f'http://127.0.0.1:{args.port}/team.html')
    server.serve_forever()
