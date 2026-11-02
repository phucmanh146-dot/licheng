"""Floating control lifecycle tests; no screen capture or native automation."""
import io
import queue
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import growth_wechat_float as floating

class FloatingTests(unittest.TestCase):
    def tearDown(self): floating.SESSIONS.clear()

    def test_closed_widget_still_delivers_stop_to_browser(self):
        events=queue.Queue();events.put({'type':'stop'})
        process=SimpleNamespace(poll=lambda:0,stdin=io.StringIO(),wait=lambda timeout:None)
        floating.SESSIONS['fixture']={'process':process,'events':events,'until':0}
        self.assertIn({'type':'stop'},floating.poll('fixture')['events'])
        self.assertNotIn('fixture',floating.SESSIONS)

    def test_missing_session_stops_browser_share(self):
        self.assertEqual(floating.poll('missing')['events'],[{'type':'stop'}])

    def test_unrequested_frame_never_reaches_widget(self):
        process=SimpleNamespace(poll=lambda:None,stdin=io.StringIO())
        floating.SESSIONS['fixture']={'process':process,'capture':None}
        with self.assertRaises(floating.RescueError): floating.submit_frame({'id':'fixture','image':'data:image/png;base64,AA=='})
        self.assertEqual(process.stdin.getvalue(),'')

if __name__=='__main__': unittest.main()
