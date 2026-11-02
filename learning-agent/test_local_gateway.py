"""Local gateway connection boundaries; model calls are controlled test fixtures."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import hermes_gateway as local
import rescue_service as rescue


class LocalGatewayTests(unittest.TestCase):
    def setUp(self):
        self.config = {'base': 'http://127.0.0.1:1234/v1', 'model': 'existing',
                       'key': '', 'protocol': 'chat', 'verified': False}
        self.env = patch.dict(os.environ, {'HERMES_GATEWAY_KEY': ''})
        self.env.start()
        self.config_patch = patch.dict(rescue.CONFIG, self.config, clear=True)
        self.config_patch.start()

    def tearDown(self):
        self.config_patch.stop()
        self.env.stop()

    def test_initialize_never_calls_model_or_reads_credentials(self):
        with patch.object(local, 'load_hermes_gateway_key') as load, patch.object(rescue, 'complete') as complete:
            local.initialize()
        load.assert_not_called()
        complete.assert_not_called()
        self.assertEqual(rescue.CONFIG, self.config)

    def test_missing_key_keeps_existing_connection(self):
        with patch.object(local, 'load_hermes_gateway_key', return_value=''), patch.object(rescue, 'complete') as complete:
            self.assertIsNone(local.connect_local_gateway())
        complete.assert_not_called()
        self.assertEqual(rescue.CONFIG, self.config)

    def test_catalog_success_is_not_inference_success(self):
        with patch.object(local, 'load_hermes_gateway_key', return_value='fixture-only-key'), patch.object(local, 'gateway_port_open', return_value=True), patch.object(rescue, 'model_request', return_value={'data': []}), patch.object(rescue, 'complete', side_effect=ValueError('controlled inference failure')):
            self.assertIsNone(local.connect_local_gateway())
        self.assertEqual(rescue.CONFIG, self.config)

    def test_success_requires_completion_and_returns_no_key(self):
        with patch.object(local, 'load_hermes_gateway_key', return_value='fixture-only-key'), patch.object(local, 'gateway_port_open', return_value=True), patch.object(rescue, 'model_request', return_value={'data': []}), patch.object(rescue, 'complete', return_value='连接成功') as complete:
            result = local.connect_local_gateway()
        complete.assert_called_once()
        self.assertTrue(result['configured'])
        self.assertTrue(result['verified'])
        self.assertNotIn('key', result)
        self.assertNotIn('fixture-only-key', json.dumps(result))

    def test_credential_file_only_imports_gateway_key(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(local.Path, 'home', return_value=Path(directory)):
            folder = Path(directory) / '.hermes'
            folder.mkdir()
            (folder / '.env').write_text("API_SERVER_KEY='fixture-only-key'\nSHANGAN_UNRELATED_FIXTURE=not-imported\n", encoding='utf-8')
            self.assertEqual(local.load_hermes_gateway_key(), 'fixture-only-key')
            self.assertNotIn('SHANGAN_UNRELATED_FIXTURE', os.environ)


if __name__ == '__main__':
    unittest.main()
