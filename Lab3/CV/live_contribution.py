"""Live contribution acceptance using accounts from live_backend.py --retain-demo.

Create an isolated milestone through SQL/MCP first, named 'API acceptance <run>'
with target_points=15 and current_points=0. Pass its ID and the demo manifest.
After testing, remove its contributions/milestone through SQL, then reset-demo.
Only the authenticated user RPC changes balances here.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from threading import Barrier
import uuid

import httpx
from dotenv import dotenv_values, load_dotenv

from live_target import validate_target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--milestone-id', type=int, required=True)
    options = parser.parse_args()
    here = Path(__file__).resolve().parent
    load_dotenv(here / '.env')
    frontend = dotenv_values(here.parent / 'frontend/.env')
    url = validate_target(os.environ['SUPABASE_URL'], frontend['EXPO_PUBLIC_SUPABASE_URL'],
                          os.getenv('LIVE_TEST_PROJECT_REF', ''))
    manifest = json.loads(options.manifest.read_text())
    assert manifest['project'] == url
    key = frontend['EXPO_PUBLIC_SUPABASE_ANON_KEY']
    accounts = manifest['accounts']
    checks = []

    def request(path, body=None, account=None):
        token = account['token'] if account else key
        return httpx.request('POST' if body is not None else 'GET', url + path,
                             headers={'apikey': key, 'Authorization': 'Bearer ' + token},
                             json=body, timeout=30)

    def read(path, account):
        response = request(path, account=account)
        assert response.is_success, f'read HTTP {response.status_code}'
        return response.json()

    for account in accounts:
        response = request('/auth/v1/token?grant_type=password',
                           {'email': account['email'], 'password': account['password']})
        assert response.is_success, f'login HTTP {response.status_code}'
        account['token'] = response.json()['access_token']
    owner, observer = accounts
    milestone_path = f'/rest/v1/rpc/list_milestones?id=eq.{options.milestone_id}'
    contributions_path = f'/rest/v1/rpc/list_my_milestone_contributions?milestone_id=eq.{options.milestone_id}'
    milestone = read(milestone_path, owner)[0]
    assert milestone['name'] == 'API acceptance ' + manifest['run']
    assert (milestone['target_points'], milestone['current_points'], milestone['status']) == (15, 0, 'Active')

    def balance():
        return read('/rest/v1/profiles?select=eco_points,available_eco_points,xp', owner)[0]

    assert balance() == {'eco_points': 20, 'available_eco_points': 20, 'xp': 20}
    payload = {'p_milestone_id': options.milestone_id, 'p_amount': 10,
               'p_client_request_id': str(uuid.uuid4())}
    endpoint = '/rest/v1/rpc/contribute_to_milestone'
    barrier = Barrier(2)

    def contribute(_):
        barrier.wait(timeout=10)
        return request(endpoint, payload, owner)

    report = {'tested_at': datetime.now(timezone.utc).isoformat(), 'project': url,
              'run': manifest['run'], 'milestone_id': options.milestone_id,
              'fixture_source': manifest.get('source', 'retained live backend journey'),
              'user_ids': [account['id'] for account in accounts], 'passed': False, 'checks': checks}
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(contribute, range(2)))
        assert all(response.status_code == 200 for response in responses), [r.status_code for r in responses]
        assert all(response.json()[0]['accepted_amount'] == 10 for response in responses)
        assert balance() == {'eco_points': 20, 'available_eco_points': 10, 'xp': 20}
        rows = read(contributions_path, owner)
        assert len(rows) == 1 and rows[0]['amount'] == 10
        checks.append('simultaneous identical requests create one contribution and debit once')

        assert request(endpoint, {**payload, 'p_amount': 5}, owner).status_code == 400
        assert request(endpoint, {**payload, 'p_client_request_id': str(uuid.uuid4())}, observer).status_code == 400
        assert read(contributions_path, observer) == []
        checks.append('changed-amount UUID reuse and zero-balance user rejected; contributions owner-only')

        capped_payload = {**payload, 'p_client_request_id': str(uuid.uuid4())}
        capped = request(endpoint, capped_payload, owner)
        assert capped.status_code == 200
        assert capped.json()[0]['accepted_amount'] == 5
        assert capped.json()[0]['status'] == 'AwaitingVerification'
        assert request(endpoint, capped_payload, owner).status_code == 200
        assert balance() == {'eco_points': 20, 'available_eco_points': 5, 'xp': 20}
        milestone = read(milestone_path, owner)[0]
        assert milestone['current_points'] == 15 and milestone['status'] == 'AwaitingVerification'
        rows = read(contributions_path, owner)
        assert len(rows) == 2 and sum(row['amount'] for row in rows) == 15
        checks.append('final contribution capped at remaining target; retry safe after milestone closes')
        report['passed'] = True
        for check in checks:
            print('PASS: ' + check, flush=True)
    finally:
        target = options.manifest.parent / ('contribution-' + manifest['run'] + '.json')
        target.write_text(json.dumps(report, indent=2))
        print('Evidence saved to ' + str(target), flush=True)


if __name__ == '__main__':
    main()
