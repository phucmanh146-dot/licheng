"""Transport contracts using fake HTTP responses, never real model credentials."""
import io
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler
sys.path.insert(0,str(Path(__file__).parent))
rescue=types.ModuleType('rescue_service')
class RescueError(Exception):
    def __init__(self,message,code='ERROR',status=502,**extra):
        super().__init__(message);self.code=code;self.status=status;self.extra=extra
rescue.RescueError=RescueError
rescue.NoRedirect=HTTPRedirectHandler
rescue.validate_url=lambda *a,**kw:None
sys.modules['rescue_service']=rescue
import growth_models as models

class Models(unittest.TestCase):
    def test_classifies_billing_separately_from_rate_limit(self):
        cases=[(401,{},'AUTH'),(402,{},'BILLING'),(429,{'error':{'code':'insufficient_quota'}},'BILLING'),
               (429,{'error':{'message':'余额不足或无可用资源包'}},'BILLING'),(429,{},'RATE_LIMIT'),
               (403,{},'PERMISSION'),(404,{},'MODEL_NOT_FOUND'),(400,{'error':{'code':'model_not_found'}},'MODEL_NOT_FOUND'),
               (503,{},'SERVER'),(400,{},'BAD_REQUEST')]
        for status,data,expected in cases:self.assertEqual(models.category(status,data),expected)

    def test_error_body_and_api_key_never_returned(self):
        secret='test-secret-not-a-real-key'
        error=HTTPError('https://example.org/v1/chat/completions',401,'error',{},io.BytesIO(json.dumps({'error':{'message':secret}}).encode()))
        with patch.object(models,'build_opener') as factory:
            factory.return_value.open.side_effect=error
            with self.assertRaises(RescueError) as caught:
                models.model_request({'base':'https://example.org/v1','key':secret},'/chat/completions',{'model':'fixture'})
        self.assertEqual(caught.exception.code,'AUTH')
        self.assertNotIn(secret,str(caught.exception))
        self.assertNotIn(secret,str(caught.exception.extra))

    def test_real_http_request_is_required(self):
        reply=io.BytesIO(b'{"choices":[{"message":{"content":"OK"}}]}')
        with patch.object(models,'build_opener') as factory:
            factory.return_value.open.return_value=reply
            result=models.model_request({'base':'https://example.org/v1','key':'fixture'},'/chat/completions',{'model':'test-model','messages':[{'role':'user','content':'reply OK'}]})
        request=factory.return_value.open.call_args.args[0]
        self.assertEqual(request.get_method(),'POST')
        self.assertEqual(json.loads(request.data)['model'],'test-model')
        self.assertEqual(result['choices'][0]['message']['content'],'OK')

if __name__=='__main__':unittest.main()
