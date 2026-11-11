import json
import os
from pathlib import Path
import tempfile
import unittest

from demo_data import Demo, PROJECT, new_manifest, reset_sql, save, seed_sql, validate_manifest
import uuid


class DemoDataTests(unittest.TestCase):
    def setUp(self):
        self.manifest = new_manifest()
        self.url = f'https://{PROJECT}.supabase.co'
        for account in self.manifest['accounts']:
            account['id'] = str(uuid.uuid4())

    def test_rejects_other_project_and_modified_account(self):
        with self.assertRaises(ValueError):
            validate_manifest(self.manifest, 'https://other.supabase.co')
        self.manifest['accounts'][0]['email'] = 'someone@example.com'
        with self.assertRaises(ValueError):
            validate_manifest(self.manifest, self.url)

    def test_rejects_injected_identifier(self):
        self.manifest['accounts'][0]['id'] = "'); DELETE FROM auth.users; --"
        with self.assertRaises(ValueError):
            validate_manifest(self.manifest, self.url)

    def test_credentials_remain_private_after_repeated_save(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'manifest.json'
            save(target, self.manifest)
            os.chmod(target, 0o644)
            save(target, self.manifest)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(target.read_text()), self.manifest)

    def test_sql_preserves_presenter_state_and_scopes_cleanup(self):
        validate_manifest(self.manifest, self.url)
        seed = seed_sql(self.manifest)
        for account in self.manifest['accounts'][:2]:
            self.assertNotIn(account['id'], seed)
        self.assertEqual(seed.count('PERFORM public.finalize_recycling_activity'), 3)
        reset = reset_sql(self.manifest)
        self.assertIn('Fixture has contributions involving other users', reset)
        self.assertIn('SC2006 demo ' + self.manifest['run'], reset)
        self.assertLess(reset.index('DELETE FROM public.milestone_contributions'), reset.index('DELETE FROM public.milestones'))

    def test_account_setup_recovers_create_response_loss_without_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            demo = Demo.__new__(Demo)
            demo.path = Path(folder) / 'manifest.json'
            demo.data = new_manifest()
            demo.login = lambda account: None
            users = []
            lose_response = True

            def request(method, path, payload=None):
                nonlocal lose_response
                if method == 'GET':
                    return {'users': users}
                user = {'id': str(uuid.uuid4()), **payload}
                users.append(user)
                if lose_response:
                    lose_response = False
                    raise ConnectionError('Response lost after remote create')
                return user

            demo.request = request
            with self.assertRaises(ConnectionError):
                demo.accounts()
            demo.data = json.loads(demo.path.read_text())
            self.assertNotIn('id', demo.data['accounts'][0])
            demo.accounts()
            demo.accounts()
            self.assertEqual(len(users), 5)
            self.assertEqual(demo.data['accounts'][0]['id'], users[0]['id'])


if __name__ == '__main__':
    unittest.main()
