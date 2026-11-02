"""Runs the isolated speech worker without sending user media to external services."""
import json, subprocess, threading
from pathlib import Path
_ROOT=Path(__file__).resolve().parent
_PYTHON=_ROOT/'.venv-asr'/'Scripts'/'python.exe'
_WORKER=_ROOT/'local_speech_worker.py'
_LOCK=threading.Lock()
def state():
    ready=_PYTHON.is_file() and all((_ROOT/'.asr-models'/'base'/name).is_file() for name in ('model.bin','config.json','tokenizer.json','vocabulary.txt'))
    return {'available':ready,'provider':'local','model':'faster-whisper-base',
        'note':'本机 CPU 语音识别，无需转写 API Key。' if ready else '本机语音模型尚未准备完成。'}
def transcribe(file):
    if not state()['available']:
        return {'status':'local-not-ready','text':'','note':state()['note']}
    if not _LOCK.acquire(blocking=False):
        return {'status':'busy','text':'','note':'已有视频正在本机转写，请稍后重试。'}
    try:
        result=subprocess.run([str(_PYTHON),'-X','utf8',str(_WORKER),'--file',str(file)],
            capture_output=True,text=True,encoding='utf-8',timeout=140)
        lines=result.stdout.strip().splitlines()
        data=json.loads(lines[-1]) if lines else {}
        if result.returncode or not isinstance(data,dict):
            return {'status':'error','text':'','note':'本机语音识别未完成。'}
        return data
    except subprocess.TimeoutExpired:
        return {'status':'timeout','text':'','note':'本机转写超过140秒，已停止；可裁剪视频后重试。'}
    except (OSError,ValueError):
        return {'status':'error','text':'','note':'本机语音组件无法运行。'}
    finally:_LOCK.release()
