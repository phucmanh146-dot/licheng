import unittest

from fastapi.testclient import TestClient

import shared_api


class CloudLivenessTests(unittest.TestCase):
    def test_livez_is_public_and_independent_of_database_readiness(self):
        client = TestClient(shared_api.app)
        response = client.get('/livez')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'ok': True, 'mode': 'cloud', 'process': 'alive'
        })


if __name__ == '__main__':
    unittest.main()
