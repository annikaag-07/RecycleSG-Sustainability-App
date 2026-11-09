import unittest
from live_target import validate_target


class LiveTargetTests(unittest.TestCase):
    def test_explicit_matching_project(self):
        self.assertEqual(validate_target('https://demo.supabase.co/', 'https://demo.supabase.co', 'demo'),
                         'https://demo.supabase.co')

    def test_missing_or_mismatched_target_fails_before_writes(self):
        for cv, frontend, expected in [
            ('https://demo.supabase.co', 'https://demo.supabase.co', ''),
            ('https://other.supabase.co', 'https://demo.supabase.co', 'demo'),
            ('https://demo.supabase.co', 'https://other.supabase.co', 'demo'),
            ('http://demo.supabase.co', 'http://demo.supabase.co', 'demo'),
        ]:
            with self.subTest(cv=cv, frontend=frontend, expected=expected), self.assertRaises(ValueError):
                validate_target(cv, frontend, expected)
