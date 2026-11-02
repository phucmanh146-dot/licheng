"""Provider error classification without returning response bodies or API keys."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener
import rescue_service as rescue

MESSAGES = {
    'AUTH': '密钥验证失败，请检查所选服务商的 API Key。',
    'BILLING': '模型账户余额或配额不足，请检查服务商的账单与用量。',
    'MODEL_NOT_FOUND': '未找到模型或接口，请核对 Model ID 和 Base URL。',
    'PERMISSION': '当前密钥无权使用此模型或服务。',
    'RATE_LIMIT': '请求达到频率限制，请稍后重试。',
    'NETWORK': '无法连接模型服务，请检查地址和网络。',
    'SERVER': '模型服务暂时异常，请稍后重试。',
    'BAD_REQUEST': '服务不接受此请求，请检查模型与接口类型是否匹配。',
}


def category(status, data):
    error = data.get('error', data) if isinstance(data, dict) else {}
    if not isinstance(error, dict):
        error = {'message': str(error)}
    code = str(error.get('code') or error.get('type') or '').lower()
    description = ' '.join(str(error.get(k, '')) for k in ('code', 'type', 'message')).lower()
    if status == 401 or any(t in code for t in ('invalid_api_key', 'authentication', 'invalidapikey')):
        return 'AUTH'
    if status == 402 or any(t in description for t in ('insufficient_quota', 'insufficient balance', 'credit_balance_exhausted', 'billing', 'quota_exceeded', '余额不足', '欠费', '无可用资源包')):
        return 'BILLING'
    if any(t in description for t in ('permission', 'not authorized', 'access denied', '无权', '未开放', '无权限')) or status == 403:
        return 'PERMISSION'
    if status == 404 or any(t in description for t in ('model_not_found', 'modelnotfound', 'model does not exist', '模型不存在')):
        return 'MODEL_NOT_FOUND'
    if status == 429 or any(t in code for t in ('rate_limit', 'ratelimit', 'throttling')):
        return 'RATE_LIMIT'
    if status >= 500:
        return 'SERVER'
    return 'BAD_REQUEST'


def failure(status, body, stage):
    kind = category(status, body)
    return rescue.RescueError(MESSAGES[kind], kind, httpStatus=status, stage=stage)


def model_request(cfg, path, body=None, stage='connection'):
    # Reuse the original URL/IP validation and reject credential redirects.
    rescue.validate_url(cfg['base'], local_ai=True)
    if not path.startswith('/') or path.startswith('//'):
        raise rescue.RescueError('模型接口路径无效。', 'BAD_REQUEST', 400)
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if cfg.get('protocol') == 'anthropic':
        headers.update({'x-api-key': cfg['key'], 'anthropic-version': '2023-06-01'})
    elif cfg.get('key'):
        headers['Authorization'] = 'Bearer ' + cfg['key']
    try:
        request = Request(cfg['base'] + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        with build_opener(rescue.NoRedirect()).open(request, timeout=30 if body is None else 65) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise rescue.RescueError('模型返回的数据过大。', 'MODEL_FORMAT', stage=stage)
            result = json.loads(raw)
            if isinstance(result, dict) and result.get('error'):
                raise failure(400, result, stage)
            return result
    except HTTPError as exc:
        try:
            error = json.loads(exc.read(65536))
        except (ValueError, UnicodeError, OSError):
            error = {}
        raise failure(exc.code, error, stage) from None
    except (URLError, TimeoutError, OSError):
        raise rescue.RescueError(MESSAGES['NETWORK'], 'NETWORK', stage=stage) from None
    except (ValueError, UnicodeError):
        raise rescue.RescueError('返回内容不是有效模型数据，请核对 API 地址。', 'MODEL_FORMAT', stage=stage) from None
