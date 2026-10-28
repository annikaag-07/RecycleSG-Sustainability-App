"""HTTP boundary tests; inference is mocked and no API calls are made."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import app as api
from classifier import MissingKeyError


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json(), {'ok': True})

    def test_unsupported_type(self):
        with patch.object(api, 'classify_image') as classify:
            response = self.client.post('/classify', files={'file': ('a.txt', b'a', 'text/plain')})
        self.assertEqual(response.status_code, 415)
        classify.assert_not_called()

    def test_oversized_file(self):
        with patch.object(api, 'MAX_BYTES', 2), patch.object(api, 'classify_image') as classify:
            response = self.client.post('/classify', files={'file': ('a.jpg', b'abc', 'image/jpeg')})
        self.assertEqual(response.status_code, 413)
        classify.assert_not_called()

    def test_empty_file(self):
        with patch.object(api, 'classify_image', return_value={}) as classify:
            response = self.client.post('/classify', files={'file': ('a.jpg', b'', 'image/jpeg')})
        self.assertEqual(response.status_code, 400)
        classify.assert_not_called()

    def test_missing_key(self):
        with patch.object(api, 'classify_image', side_effect=MissingKeyError('not configured')):
            response = self.client.post('/classify', files={'file': ('a.jpg', b'a', 'image/jpeg')})
        self.assertEqual(response.status_code, 503)

    def test_result_contract_and_input_forwarding(self):
        for status in ['ok', 'unsure', 'unavailable']:
            with self.subTest(status=status):
                result = {'status': status, 'material': 'plastic' if status == 'ok' else None,
                          'confidence': 0.9 if status == 'ok' else 0.0}
                with patch.object(api, 'classify_image', return_value=result) as classify:
                    response = self.client.post('/classify', files={'file': ('a.png', b'abc', 'image/png')})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), result)
                classify.assert_called_once_with(b'abc', 'image/png', 'a.png')
