"""Offline tests: no API key or network needed. Run: python -m unittest discover tests"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.pop("CV_MOCK", None)
import classifier as c  # noqa: E402


def fake(material, conf):
    return lambda b, m: c.GeminiResult(material=material, confidence=conf, reason="test")


class ClassifierTests(unittest.TestCase):
    def test_provider_failure_logs_type_and_code_without_secret_message(self):
        error = RuntimeError('provider message containing secret-key')
        error.code = 429
        with mock.patch.object(c, '_call_gemini', side_effect=error), self.assertLogs('classifier', level='WARNING') as captured:
            result = c.classify_image(b'x')
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('RuntimeError', str(captured.output))
        self.assertIn('429', str(captured.output))
        self.assertNotIn('secret-key', str(captured.output) + str(result))

    def test_invalid_confidence_never_verifies(self):
        for confidence in [float('nan'), float('inf'), -1, 7]:
            with self.subTest(confidence=confidence), mock.patch.object(c, '_call_gemini', fake('plastic', confidence)):
                self.assertEqual(c.classify_image(b'x')['status'], 'unavailable')

    def test_rate_limit_returns_without_sleep_or_repeated_calls(self):
        with mock.patch.object(c, '_call_gemini', side_effect=RuntimeError('429 secret diagnostic')) as call, mock.patch.object(c.time, 'sleep') as sleep:
            result = c.classify_image(b'x')
        self.assertEqual(result['status'], 'unavailable')
        call.assert_called_once()
        sleep.assert_not_called()
        self.assertNotIn('secret diagnostic', str(result))

    def test_confident_result_is_ok(self):
        with mock.patch.object(c, "_call_gemini", fake("glass", 0.9)):
            r = c.classify_image(b"x")
        self.assertEqual((r["status"], r["material"], r["suggestion"]), ("ok", "glass", "glass"))

    def test_low_confidence_is_unsure_but_keeps_suggestion(self):
        with mock.patch.object(c, "_call_gemini", fake("plastic", 0.3)):
            r = c.classify_image(b"x")
        self.assertEqual((r["status"], r["material"], r["suggestion"]), ("unsure", None, "plastic"))

    def test_unclear_is_unsure_without_suggestion(self):
        with mock.patch.object(c, "_call_gemini", fake("unclear", 0.95)):
            r = c.classify_image(b"x")
        self.assertEqual((r["status"], r["suggestion"]), ("unsure", None))

    def test_api_failure_falls_back(self):
        def boom(b, m):
            raise ConnectionError("network down")
        with mock.patch.object(c, "_call_gemini", boom):
            r = c.classify_image(b"x")
        self.assertEqual((r["status"], r["material"]), ("unavailable", None))

    def test_missing_key_raises(self):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            c._client = None
            with self.assertRaises(c.MissingKeyError):
                c.classify_image(b"x")

    def test_mock_mode_uses_filename(self):
        with mock.patch.dict(os.environ, {"CV_MOCK": "1"}):
            r = c.classify_image(b"x", filename="lighting_waste_1.jpg")
        self.assertEqual(r["material"], "lighting waste")


if __name__ == "__main__":
    unittest.main()
