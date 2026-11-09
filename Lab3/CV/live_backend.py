"""Opt-in API acceptance: real Supabase + Gemini, simulated GPS, no UI.

Run from CV with LIVE_TEST_PROJECT_REF set; see docs/demo/BACKEND_INTEGRATION.md.
Creates two confirmed accounts, private photos and a dedicated test milestone.
Finally removes only those resources, including contributions before Auth users.
--retain-demo keeps successful fixtures and writes credentials to ignored results/.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import uuid

import httpx
from dotenv import dotenv_values, load_dotenv
from fastapi.testclient import TestClient

from live_target import validate_target

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / '.env')
os.environ.pop('CV_MOCK', None)
from app import app


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--retain-demo', action='store_true')
    args.add_argument('--skip-contribution', action='store_true',
                      help='Explicitly omit the hosted milestone check; report remains incomplete.')
    args.add_argument('--reset-demo', type=Path, help='Remove only fixtures recorded in a retained demo manifest.')
    options = args.parse_args()
    retain = options.retain_demo
    frontend = dotenv_values(HERE.parent / 'frontend/.env')
    url = validate_target(os.environ['SUPABASE_URL'], frontend['EXPO_PUBLIC_SUPABASE_URL'],
                          os.getenv('LIVE_TEST_PROJECT_REF', ''))
    admin = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    anon = frontend['EXPO_PUBLIC_SUPABASE_ANON_KEY']
    accounts, photos, checks = [], [], []
    milestone = None
    passed = False
    run = uuid.uuid4().hex
    result_dir = HERE / 'results'
    result_dir.mkdir(exist_ok=True)

    def record(label):
        checks.append(label)
        print('PASS: ' + label, flush=True)

    def call(method, path, *, account=None, payload=None, content=None, expected=None, public=False):
        key = anon if account or public else admin
        token = account['token'] if account else key
        headers = {'apikey': key, 'Authorization': 'Bearer ' + token, 'Prefer': 'return=representation'}
        if content is not None:
            headers['Content-Type'] = 'image/png'
        response = httpx.request(method, url + path, headers=headers, json=payload,
                                 content=content, timeout=30)
        # Never dump bodies/headers containing access tokens or provider details.
        if expected:
            assert response.status_code in expected, f'{method} {path.split("?")[0]} HTTP {response.status_code}'
            return None
        assert response.is_success, f'{method} {path.split("?")[0]} HTTP {response.status_code}'
        return response.json() if response.content else None

    def rpc(name, payload, account):
        return call('POST', '/rest/v1/rpc/' + name, payload=payload, account=account)

    def verify(action, account):
        with TestClient(app) as client:
            response = client.post('/verify', json={'activity_id': action},
                                   headers={'Authorization': 'Bearer ' + account['token']})
        assert response.status_code == 200, f'verify HTTP {response.status_code}'
        return response.json()

    def profile(account):
        return call('GET', '/rest/v1/profiles?select=eco_points,available_eco_points,xp', account=account)[0]

    if options.reset_demo:
        manifest = json.loads(options.reset_demo.read_text())
        assert manifest['project'] == url, 'Demo manifest belongs to another project'
        # Validate all resources before removing any; never reset shared seed data.
        ids = {account['id'] for account in manifest['accounts']}
        assert ids and all(photo.split('/')[0] in ids for photo in manifest['photos'])
        for account in manifest['accounts']:
            saved = call('GET', '/auth/v1/admin/users/' + account['id'])
            assert saved['email'] == account['email'] and saved['email'].startswith('recyclesg-api-')
        mid = manifest['milestone']
        if mid is not None:
            saved = call('GET', f'/rest/v1/milestones?id=eq.{mid}')[0]
            assert saved['name'] == f'API acceptance {manifest["run"]}'
            call('DELETE', f'/rest/v1/milestone_contributions?milestone_id=eq.{mid}')
            call('DELETE', f'/rest/v1/milestones?id=eq.{mid}')
        call('DELETE', '/storage/v1/object/recycling-photos', payload={'prefixes': manifest['photos']})
        for account in manifest['accounts']:
            session = call('POST', '/auth/v1/token?grant_type=password', public=True,
                           payload={'email': account['email'], 'password': account['password']})
            call('POST', '/auth/v1/logout?scope=global', account={'token': session['access_token']})
            call('DELETE', '/auth/v1/admin/users/' + account['id'])
        options.reset_demo.unlink()
        print('CLEANUP: retained demo fixtures removed', flush=True)
        return

    try:
        for label in ['Demo Recycler A', 'Demo Recycler B']:
            account = {'email': f'recyclesg-api-{uuid.uuid4().hex}@example.com',
                       'password': secrets.token_urlsafe(32), 'label': label}
            created = call('POST', '/auth/v1/admin/users', payload={
                'email': account['email'], 'password': account['password'], 'email_confirm': True,
                'user_metadata': {'display_name': label}})
            account['id'] = created['id']
            accounts.append(account)  # Register for cleanup before login can fail.
            session = call('POST', '/auth/v1/token?grant_type=password', public=True,
                           payload={'email': account['email'], 'password': account['password']})
            account['token'] = session['access_token']
            assert profile(account)['eco_points'] == 0
        a, b = accounts
        record('two real password logins and zero-point profiles')

        origins = [(1.35, 103.7), (1.354, 103.945)]
        nearby = [rpc('search_nearby_recycling_points', {
            'p_latitude': lat, 'p_longitude': lng, 'p_radius_km': 5, 'p_limit': 3}, a)
            for lat, lng in origins]
        assert all(rows and all(0 <= row['distance_km'] <= 5 for row in rows) for rows in nearby)
        assert nearby[0][0]['id'] != nearby[1][0]['id']
        record('different search origins return different nearby bins')
        points = call('POST', '/rest/v1/rpc/search_recycling_points_by_material?limit=3',
                      account=a, payload={'p_material': 'Plastic'})
        materials = {row['name']: row['id'] for row in call('GET', '/rest/v1/material_types?select=id,name', account=a)}
        image = (HERE.parent.parent / 'docs/demo/assets/plastic-bottle.png').read_bytes()
        with TestClient(app) as client:
            suggestion = client.post('/classify', files={'file': ('bottle.png', image, 'image/png')})
        assert suggestion.status_code == 200
        assert suggestion.json()['status'] == 'ok' and suggestion.json()['material'] == 'plastic'
        assert suggestion.json()['model'] != 'mock'
        assert profile(a)['eco_points'] == 0
        record('real Gemini suggestion is plastic and awards nothing')

        def submit(index, material):
            point = points[index]
            checkin = rpc('create_gps_checkin', {'p_recycling_point_id': point['id'],
                          'p_latitude': point['latitude'], 'p_longitude': point['longitude']}, a)
            photo = f'{a["id"]}/backend-{run}-{index}.png'
            photos.append(photo)
            call('POST', '/storage/v1/object/recycling-photos/' + photo, account=a, content=image)
            return rpc('submit_recycling_activity', {'p_check_in_id': checkin,
                       'p_material_type_id': materials[material], 'p_quantity': 1, 'p_photo_url': photo}, a)

        action = submit(0, 'Plastic')
        with TestClient(app) as client:
            assert client.post('/verify', json={'activity_id': action}).status_code == 401
            assert client.post('/verify', json={'activity_id': action},
                               headers={'Authorization': 'Bearer ' + b['token']}).status_code == 404
        call('GET', '/storage/v1/object/authenticated/recycling-photos/' + photos[0], account=b, expected={400, 403, 404})
        assert call('GET', f'/rest/v1/recycling_actions?id=eq.{action}', account=b) == []
        record('foreign account cannot verify, read the activity or download its photo')

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: verify(action, a), range(2)))
        assert all(r['status'] == 'Verified' and r['activity_impact']['estimated_co2_saved_kg'] == .1 for r in results)
        assert verify(action, a)['activity_impact'] == results[0]['activity_impact']
        assert profile(a) == {'eco_points': 10, 'available_eco_points': 10, 'xp': 10}
        assert len(call('GET', f'/rest/v1/reward_transactions?recycling_action_id=eq.{action}', account=a)) == 1
        assert len(call('GET', '/rest/v1/user_badges', account=a)) == 1
        record('concurrent real Gemini verification and retry award exactly once; badge unlocked')

        rejected = submit(1, 'Glass')
        assert verify(rejected, a)['status'] == 'Rejected'
        assert verify(rejected, a)['activity_impact']['estimated_co2_saved_kg'] == 0
        pending = submit(2, 'Plastic')
        impact = rpc('get_user_environmental_impact', {'p_user_id': a['id']}, a)[0]
        assert float(impact['estimated_co2_saved_kg']) == .1 and impact['total_recycled_units'] == 1
        assert rpc('get_user_environmental_impact', {'p_user_id': a['id']}, b)[0]['total_recycled_units'] == 0
        feed = rpc('get_community_feed', {'p_limit': 100}, b)
        own = next(row for row in feed if row['activity_id'] == action)
        assert own['display_name'] == a['label'] and own['username'] == 'Anonymous Recycler'
        assert not any(row['activity_id'] in [rejected, pending] for row in feed)
        assert profile(a)['eco_points'] == 10 and profile(b)['eco_points'] == 0
        record('second user sees populated feed; Pending/Rejected excluded from feed, impact and rewards')

        quest = call('GET', '/rest/v1/quests?quest_type=eq.one_time&order=id&limit=1', account=a)[0]
        rpc('claim_quest_reward', {'p_quest_id': quest['id'], 'p_period_start': '1970-01-01'}, a)
        call('POST', '/rest/v1/rpc/claim_quest_reward', account=a,
             payload={'p_quest_id': quest['id'], 'p_period_start': '1970-01-01'}, expected={400})
        assert profile(a) == {'eco_points': 20, 'available_eco_points': 20, 'xp': 20}
        record('quest claims once; lifetime/available/XP totals are 20/20/20')

        if options.skip_contribution:
            print('SKIP: hosted contribution test explicitly omitted; full acceptance is incomplete', flush=True)
        else:
            milestone = call('POST', '/rest/v1/milestones', payload={
                'name': f'API acceptance {run}', 'organisation': 'Classroom test', 'target_points': 100})[0]['id']
            contribution = {'p_milestone_id': milestone, 'p_amount': 10, 'p_client_request_id': str(uuid.uuid4())}
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda _: rpc('contribute_to_milestone', contribution, a), range(2)))
            assert profile(a) == {'eco_points': 20, 'available_eco_points': 10, 'xp': 20}
            assert len(call('GET', f'/rest/v1/milestone_contributions?milestone_id=eq.{milestone}', account=a)) == 1
            record('concurrent contribution retries debit once; totals are 20/10/20')
        if retain:
            credentials = [{k: v for k, v in account.items() if k != 'token'} for account in accounts]
            target = result_dir / f'demo-{run}.json'
            with open(target, 'w', opener=lambda path, flags: os.open(path, flags, 0o600)) as handle:
                json.dump({'project': url, 'run': run, 'accounts': credentials, 'milestone': milestone, 'photos': photos}, handle, indent=2)
            print(f'Demo fixtures retained; credentials stored privately in {target}', flush=True)
        passed = True
    finally:
        cleanup_errors = []
        if not (passed and retain):
            def cleanup(label, method, path, **kwargs):
                try:
                    call(method, path, **kwargs)
                except Exception:
                    cleanup_errors.append(label)
            if milestone is not None:
                cleanup('contributions', 'DELETE', f'/rest/v1/milestone_contributions?milestone_id=eq.{milestone}')
                cleanup('milestone', 'DELETE', f'/rest/v1/milestones?id=eq.{milestone}')
            if photos:
                cleanup('photos', 'DELETE', '/storage/v1/object/recycling-photos', payload={'prefixes': photos})
            for account in accounts:
                if account.get('token'):
                    cleanup('logout', 'POST', '/auth/v1/logout?scope=global', account=account)
                cleanup('account ' + account['id'], 'DELETE', '/auth/v1/admin/users/' + account['id'])
            print('CLEANUP: ' + (', '.join(cleanup_errors) if cleanup_errors else 'all test fixtures removed'), flush=True)
        report = {'tested_at': datetime.now(timezone.utc).isoformat(), 'project': url, 'checks': checks,
                  'passed': passed and not cleanup_errors and not options.skip_contribution,
                  'core_passed': passed and not cleanup_errors,
                  'skipped': ['hosted contribution'] if options.skip_contribution else [],
                  'gps': 'simulated', 'gemini': 'real',
                  'transport': 'in-process FastAPI + real hosted HTTP', 'retained': passed and retain,
                  'cleanup_errors': cleanup_errors, 'created_user_ids': [a['id'] for a in accounts]}
        (result_dir / f'backend-{run}.json').write_text(json.dumps(report, indent=2))
        if cleanup_errors:
            raise RuntimeError('Cleanup incomplete; inspect results report before another run.')


if __name__ == '__main__':
    main()
