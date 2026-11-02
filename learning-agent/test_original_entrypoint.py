"""Default launcher must preserve the original screen and state directory."""
import runpy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent


class OriginalEntrypointTests(unittest.TestCase):
    def launch(self, arguments):
        execute = runpy.run_path
        before = sys.path[:]
        try:
            with patch.object(sys, 'argv', ['start_research.py', *arguments]), \
                 patch.object(runpy, 'run_path') as nested, \
                 patch('subprocess.Popen') as worker:
                execute(str(ROOT / 'start_research.py'), run_name='__main__')
                self.assertEqual(nested.call_args.args[0], str(ROOT / 'learning-agent/visual-workflow/server.py'))
                self.assertEqual(nested.call_args.kwargs['run_name'], '__main__')
                self.assertIn(str(ROOT), sys.argv)
                worker.assert_not_called()
                return list(sys.argv)
        finally:
            sys.path[:] = before

    def test_default_uses_existing_research_screen_and_workspace(self):
        self.assertIn('9010', self.launch([]))

    def test_port_and_original_server_options_are_preserved(self):
        argv = self.launch(['--port', '9011', '--workspace', 'custom-workspace'])
        self.assertIn('9011', argv)
        self.assertEqual(argv[-2:], ['--workspace', 'custom-workspace'])

    def test_legacy_alias_still_uses_original_screen(self):
        self.launch(['--legacy'])


if __name__ == '__main__':
    unittest.main()
