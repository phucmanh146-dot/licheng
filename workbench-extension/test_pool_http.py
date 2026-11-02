"""Exercise new HTTP routes with a minimal legacy-host fixture, not live apps."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen, HTTPRedirectHandler
from urllib.parse import urlparse, parse_qs

TEMP=tempfile.TemporaryDirectory();os.environ['SHANGAN_GROWTH_DATA']=TEMP.name
sys.path.insert(0,str(Path(__file__).parent))
rescue=types.ModuleType('rescue_service')
class RescueError(Exception):
    def __init__(self,message,code='ERROR',status=502,**extra):
        super().__init__(message);self.code=code;self.status=status;self.extra=extra
rescue.RescueError=RescueError;rescue.NoRedirect=HTTPRedirectHandler
sys.modules['rescue_service']=rescue
legacy=types.ModuleType('local_server')
class Base(BaseHTTPRequestHandler):
    def send_json(self,data,status=200):
        raw=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(raw)
    def do_GET(self):self.send_json({},404)
    def do_POST(self):self.send_json({},404)
    def log_message(self,*args):pass
legacy.Handler=Base;sys.modules['local_server']=legacy
import growth_server as app
server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)

def call(path,body=None,headers=None):
    headers={'Origin':BASE,**(headers or {})}
    if headers.get('Origin') is None:headers.pop('Origin',None)
    if body is not None:headers['Content-Type']='application/json'
    request=Request(BASE+path,json.dumps(body).encode() if body is not None else None,headers)
    try:
        with urlopen(request,timeout=2) as response:return response.status,json.load(response)
    except HTTPError as exc:return exc.code,json.load(exc)

class HTTP(unittest.TestCase):
    def test_material_access_requires_local_origin_and_write_token(self):
        body={'account':'alice','materials':[{'content':'selected message'}]}
        self.assertEqual(call('/api/growth/materials-add',body)[0],403)
        self.assertEqual(call('/api/growth/materials-add',body,{'X-Growth-Token':app.TOKEN,'Origin':'https://unrelated.example'})[0],403)
        status,result=call('/api/growth/materials-add',body,{'X-Growth-Token':app.TOKEN})
        self.assertEqual(status,200);self.assertEqual(result['materials'][0]['content'],'selected message')
        self.assertEqual(call('/api/growth/materials?account=alice',headers={'Origin':'https://unrelated.example'})[0],403)
        self.assertEqual(call('/api/growth/materials?account=bob')[1]['materials'],[])

    def test_pairing_not_available_to_unrelated_webpages(self):
        self.assertEqual(call('/api/growth/obsidian-connect',{})[0],403)
        uri=call('/api/growth/obsidian-connect',{}, {'X-Growth-Token':app.TOKEN})[1]['url']
        code=parse_qs(urlparse(uri).query)['code'][0]
        body={'code':code,'vaultId':'a'*32}
        self.assertEqual(call('/api/obsidian-bridge/register',body,{'Origin':'https://unrelated.example'})[0],403)
        status,result=call('/api/obsidian-bridge/register',body,{'Origin':None})
        self.assertEqual(status,200)
        self.assertEqual(call('/api/obsidian-bridge/poll',{'vaultId':'a'*32,'recent':[]},{'Origin':None})[0],403)
        status,state=call('/api/obsidian-bridge/poll',{'vaultId':'a'*32,'recent':[]},{'Origin':None,'X-Obsidian-Token':result['token']})
        self.assertEqual(status,200);self.assertEqual(state['jobs'],[])
        self.assertNotIn(result['token'],json.dumps(call('/api/growth/obsidian-status')[1]))

if __name__=='__main__':
    try:unittest.main()
    finally:server.shutdown();server.server_close()
