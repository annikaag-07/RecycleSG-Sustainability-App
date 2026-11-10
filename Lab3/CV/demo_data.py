"""Presentation fixtures. SQL phases run through the project-scoped Supabase MCP.

accounts -> seed-sql (apply via MCP) -> contribute -> validate
reset-sql (apply via MCP) -> reset-accounts
Use a new manifest after resetting. Commands resume an interrupted run safely.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import uuid

import httpx
from dotenv import dotenv_values

from live_target import validate_target

HERE = Path(__file__).resolve().parent
PROJECT = 'ihrgxedwftfzzohqpnnu'
PEOPLE = [('Presenter A', None, 0), ('Presenter B', None, 0),
          ('Demo Mei', 'Plastic', 2), ('Demo Ravi', 'Paper', 3), ('Demo Sara', 'Metal', 4)]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as handle:
        json.dump(data, handle, indent=2)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def new_manifest():
    run = uuid.uuid4().hex
    return {'version': 1, 'project': f'https://{PROJECT}.supabase.co', 'run': run,
            'created_at': datetime.now(timezone.utc).isoformat(), 'state': 'preparing',
            'accounts': [{'label': label, 'material': material, 'quantity': quantity,
                          'email': f'recyclesg-demo-{run}-{index}@example.com',
                          'password': secrets.token_urlsafe(24)}
                         for index, (label, material, quantity) in enumerate(PEOPLE)]}


def validate_manifest(manifest, url):
    require(manifest['project'] == url, 'Manifest project mismatch')
    require(uuid.UUID(manifest['run']).hex == manifest['run'], 'Invalid run ID')
    require(len(manifest['accounts']) == len(PEOPLE), 'Expected five accounts')
    for index, (account, spec) in enumerate(zip(manifest['accounts'], PEOPLE)):
        require((account['label'], account['material'], account['quantity']) == spec, 'Unexpected fixture definition')
        require(account['email'] == f'recyclesg-demo-{manifest["run"]}-{index}@example.com', 'Unexpected fixture email')
        if account.get('id'):
            require(str(uuid.UUID(account['id'])) == account['id'], 'Invalid account ID')


def seed_sql(manifest):
    """Transaction and advisory lock make repeated/concurrent SQL application safe."""
    run = manifest['run']
    blocks = []
    for account in manifest['accounts'][2:]:
        uid, material, quantity = account['id'], account['material'], account['quantity']
        blocks.append(f"""
    IF NOT EXISTS (SELECT 1 FROM public.recycling_actions WHERE user_id = '{uid}') THEN
        INSERT INTO public.check_ins(user_id, recycling_point_id, latitude, longitude, distance_meters)
        SELECT '{uid}', id, latitude, longitude, 0 FROM public.recycling_points
        WHERE source = 'SC2006 classroom demo (NTU N4)' RETURNING id INTO checkin_id;
        IF checkin_id IS NULL THEN RAISE EXCEPTION 'N4 fixture missing'; END IF;
        INSERT INTO public.recycling_actions(user_id, check_in_id, material_type_id, quantity)
        SELECT '{uid}', checkin_id, id, {quantity} FROM public.material_types WHERE name = '{material}'
        RETURNING id INTO activity_id;
        PERFORM public.finalize_recycling_activity(activity_id, '{uid}', 'Verified', '{material.lower()}', 1.0);
    END IF;""")
    return f"""BEGIN;
SELECT pg_advisory_xact_lock(hashtext('demo-{run}'));
DO $$ DECLARE checkin_id bigint; activity_id bigint; BEGIN
{''.join(blocks)}
    IF NOT EXISTS (SELECT 1 FROM public.milestones WHERE organisation = 'SC2006 demo {run}') THEN
        INSERT INTO public.milestones(name, organisation, description, target_points, expected_outcome)
        VALUES ('Classroom recycling challenge', 'SC2006 demo {run}',
                'Prepared classroom demonstration. Community participation goal.', 100,
                'Reach 100 community Eco Points for administrator review.');
    END IF;
END $$;
COMMIT;
"""


def reset_sql(manifest):
    ids = ','.join("'" + account['id'] + "'::uuid" for account in manifest['accounts'] if account.get('id'))
    require(ids, 'No recorded accounts to reset')
    organisation = 'SC2006 demo ' + manifest['run']
    return f"""BEGIN;
SELECT pg_advisory_xact_lock(hashtext('demo-{manifest['run']}'));
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.milestone_contributions c JOIN public.milestones m ON m.id=c.milestone_id
               WHERE (c.user_id IN ({ids}) AND m.organisation <> '{organisation}')
                  OR (m.organisation = '{organisation}' AND c.user_id NOT IN ({ids}))) THEN
        RAISE EXCEPTION 'Fixture has contributions involving other users or milestones; inspect before reset';
    END IF;
END $$;
DELETE FROM public.milestone_contributions WHERE milestone_id IN
    (SELECT id FROM public.milestones WHERE organisation = '{organisation}');
DELETE FROM public.milestones WHERE organisation = '{organisation}';
COMMIT;
"""


class Demo:
    def __init__(self, path):
        self.path = path
        cv = dotenv_values(HERE / '.env')
        frontend = dotenv_values(HERE.parent / 'frontend/.env')
        require(os.getenv('LIVE_TEST_PROJECT_REF') == PROJECT, 'Set LIVE_TEST_PROJECT_REF to the team project')
        self.url = validate_target(cv['SUPABASE_URL'], frontend['EXPO_PUBLIC_SUPABASE_URL'], PROJECT)
        self.admin = cv['SUPABASE_SERVICE_ROLE_KEY']
        self.anon = frontend['EXPO_PUBLIC_SUPABASE_ANON_KEY']
        self.data = json.loads(path.read_text()) if path.exists() else new_manifest()
        validate_manifest(self.data, self.url)
        self.tokens = {}

    def request(self, method, path, payload=None, account=None, public=False, missing=False):
        key = self.anon if account or public else self.admin
        token = self.tokens[account['id']] if account else key
        response = httpx.request(method, self.url + path, json=payload, timeout=30,
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + token})
        if missing and response.status_code == 404:
            return None
        require(response.is_success, f'{method} {path.split("?")[0]} HTTP {response.status_code}')
        return response.json() if response.content else None

    def rpc(self, name, payload, account):
        return self.request('POST', '/rest/v1/rpc/' + name, payload, account)

    def login(self, account):
        session = self.request('POST', '/auth/v1/token?grant_type=password',
                               {'email': account['email'], 'password': account['password']}, public=True)
        require(session['user']['id'] == account['id'], 'Login identity mismatch')
        self.tokens[account['id']] = session['access_token']

    def accounts(self):
        require(self.data['state'] != 'reset', 'Use a new manifest after reset')
        save(self.path, self.data)  # Persist credentials before any remote mutation.
        existing = {}
        page = 1
        while True:
            users = self.request('GET', f'/auth/v1/admin/users?page={page}&per_page=100')['users']
            existing.update({user['email']: user for user in users if user.get('email')})
            if len(users) < 100:
                break
            page += 1
        for account in self.data['accounts']:
            user = existing.get(account['email'])
            if user is None:
                require(not account.get('id'), 'Recorded account missing; reset this run before replacing it')
                user = self.request('POST', '/auth/v1/admin/users', {
                    'email': account['email'], 'password': account['password'], 'email_confirm': True,
                    'user_metadata': {'display_name': account['label']},
                    'app_metadata': {'demo_run': self.data['run']}})
            require(user.get('app_metadata', {}).get('demo_run') == self.data['run'], 'Account ownership mismatch')
            require(not account.get('id') or account['id'] == user['id'], 'Recorded account ID mismatch')
            account['id'] = user['id']
            save(self.path, self.data)
            self.login(account)
        print('PASS five confirmed demo logins; credentials saved privately to ' + str(self.path))

    def milestone(self, account):
        rows = self.rpc('list_milestones', {}, account)
        matches = [row for row in rows if row['organisation'] == 'SC2006 demo ' + self.data['run']]
        require(len(matches) == 1, 'Apply seed SQL first; expected one run-specific challenge')
        self.data['milestone'] = matches[0]['id']
        save(self.path, self.data)
        return matches[0]

    def contribute(self):
        for account in self.data['accounts'][2:]:
            self.login(account)
            milestone = self.milestone(account)
            request_id = str(uuid.uuid5(uuid.UUID(self.data['run']), account['id']))
            result = self.rpc('contribute_to_milestone', {
                'p_milestone_id': milestone['id'], 'p_amount': account['quantity'] * 10,
                'p_client_request_id': request_id}, account)
            require(result[0]['accepted_amount'] == account['quantity'] * 10, 'Contribution amount mismatch')
        print('PASS three background contributions; repeat calls use the same request IDs')

    def validate(self):
        evidence = []
        for account in self.data['accounts']:
            self.login(account)
            profile = self.request('GET', '/rest/v1/profiles?select=*', account=account)[0]
            quantity = account['quantity']
            require(profile['display_name'] == account['label'], 'Display name mismatch')
            require((profile['eco_points'], profile['available_eco_points'], profile['xp']) ==
                    (quantity * 10, 0, quantity * 10), 'Unexpected balances for ' + account['label'])
            actions = self.request('GET', '/rest/v1/recycling_actions?select=*', account=account)
            checkins = self.request('GET', '/rest/v1/check_ins?select=id', account=account)
            badges = self.request('GET', '/rest/v1/user_badges?select=badge_id', account=account)
            progress = self.request('GET', '/rest/v1/user_quest_progress?select=*', account=account)
            require(all(row['claimed_at'] is None for row in progress), 'Quest already claimed')
            require(len(actions) == len(checkins) == len(badges) == (1 if quantity else 0), 'Unexpected activity/check-in/badge state')
            impact = self.rpc('get_user_environmental_impact', {'p_user_id': account['id']}, account)[0]
            require(float(impact['estimated_co2_saved_kg']) == round(quantity * .1, 2), 'Impact mismatch')
            contributions = self.rpc('list_my_milestone_contributions', {}, account)
            require(len(contributions) == (1 if quantity else 0), 'Unexpected contribution count')
            if quantity:
                require(actions[0]['verification_status'] == 'Verified', 'Background drop not verified')
                require(contributions[0]['amount'] == quantity * 10, 'Contribution total mismatch')
                require(actions[0]['quantity'] == quantity, 'Quantity mismatch')
            evidence.append({'label': account['label'], 'id': account['id'], 'username': profile['username'],
                             'points': profile['eco_points'], 'available': profile['available_eco_points'],
                             'activity_ids': [row['id'] for row in actions],
                             'checkin_ids': [row['id'] for row in checkins],
                             'contribution_ids': [row['id'] for row in contributions]})
        observer = self.data['accounts'][1]
        feed = self.rpc('get_community_feed', {'p_limit': 100}, observer)
        for person in evidence[2:]:
            require(any(row['activity_id'] == person['activity_ids'][0] and row['display_name'] == person['label']
                        for row in feed), 'Background drop missing from public feed')
            require(self.request('GET', '/rest/v1/recycling_actions?id=eq.' + str(person['activity_ids'][0]), account=observer) == [],
                    'Private activity exposed to observer')
        for name in ['get_leaderboard', 'get_weekly_leaderboard']:
            board = self.rpc(name, {'p_limit': 100}, observer)
            for person in evidence[2:]:
                require(any(row['username'] == person['username'] and row['eco_points'] == person['points'] for row in board),
                        name + ' missing expected score')
        milestone = self.milestone(observer)
        require((milestone['target_points'], milestone['current_points'], milestone['status']) == (100, 90, 'Active'),
                'Challenge must start at 90/100 Active')
        quests = self.request('GET', '/rest/v1/quests?quest_type=eq.one_time&is_active=eq.true', account=observer)
        require(any(q['target_actions'] == 1 and q['reward_eco_points'] == q['reward_xp'] == 10 for q in quests),
                'First-drop quest missing')
        self.data['state'] = 'ready'
        self.data['evidence'] = evidence
        self.data['validated_at'] = datetime.now(timezone.utc).isoformat()
        save(self.path, self.data)
        print('PASS five logins, fresh presenters, feed, privacy, both rankings, rewards, impact and 90/100 challenge')

    def reset_accounts(self):
        # SQL cleanup must have removed the milestone before deleting users.
        rows = self.request('GET', '/rest/v1/rpc/list_milestones', public=True)
        require(not any(row['organisation'] == 'SC2006 demo ' + self.data['run'] for row in rows), 'Apply reset SQL first')
        for account in self.data['accounts']:
            if not account.get('id'):
                continue
            user = self.request('GET', '/auth/v1/admin/users/' + account['id'], missing=True)
            if user is None:
                continue
            require(user['email'] == account['email'] and user.get('app_metadata', {}).get('demo_run') == self.data['run'],
                    'Account ownership mismatch')
            self.login(account)
            require(self.rpc('list_my_milestone_contributions', {}, account) == [], 'Remove contributions through reset SQL first')
            # The app uploads flat filenames beneath the user's own prefix.
            while True:
                objects = self.request('POST', '/storage/v1/object/list/recycling-photos',
                                       {'prefix': account['id'], 'limit': 100, 'offset': 0})
                if not objects:
                    break
                require(all(obj.get('id') and '/' not in obj['name'] for obj in objects), 'Unexpected nested storage objects')
                self.request('DELETE', '/storage/v1/object/recycling-photos',
                             {'prefixes': [account['id'] + '/' + obj['name'] for obj in objects]})
            self.request('POST', '/auth/v1/logout?scope=global', account=account)
            self.request('DELETE', '/auth/v1/admin/users/' + account['id'])
            require(self.request('GET', '/auth/v1/admin/users/' + account['id'], missing=True) is None,
                    'Account deletion not confirmed')
        self.data['state'] = 'reset'
        save(self.path, self.data)
        print('PASS fixture accounts and private photos removed; manifest retained for audit')

    def exercise_reset(self):
        """Consume the disposable dataset so reset covers photos, rewards and a full goal."""
        self.validate()
        owner, observer = self.data['accounts'][:2]
        point = self.request('GET', '/rest/v1/recycling_points?source=eq.SC2006%20classroom%20demo%20(NTU%20N4)', account=owner)[0]
        material = self.request('GET', '/rest/v1/material_types?name=eq.Plastic', account=owner)[0]
        checkin = self.rpc('create_gps_checkin', {'p_recycling_point_id': point['id'],
                           'p_latitude': point['latitude'], 'p_longitude': point['longitude']}, owner)
        photo = owner['id'] + '/reset-test.png'
        response = httpx.post(self.url + '/storage/v1/object/recycling-photos/' + photo,
                              headers={'apikey': self.anon, 'Authorization': 'Bearer ' + self.tokens[owner['id']],
                                       'Content-Type': 'image/png'},
                              content=(HERE.parent.parent / 'docs/demo/assets/plastic-bottle.png').read_bytes(), timeout=30)
        require(response.is_success, 'Reset-test photo upload failed')
        action = self.rpc('submit_recycling_activity', {'p_check_in_id': checkin, 'p_material_type_id': material['id'],
                          'p_quantity': 1, 'p_photo_url': photo}, owner)
        self.request('POST', '/rest/v1/rpc/finalize_recycling_activity', {
            'p_activity_id': action, 'p_user_id': owner['id'], 'p_status': 'Verified',
            'p_predicted_material': 'plastic', 'p_confidence': 1.0})
        quest = self.request('GET', '/rest/v1/quests?quest_type=eq.one_time&target_actions=eq.1&is_active=eq.true', account=owner)[0]
        self.rpc('claim_quest_reward', {'p_quest_id': quest['id'], 'p_period_start': '1970-01-01'}, owner)
        milestone = self.milestone(owner)
        self.rpc('contribute_to_milestone', {'p_milestone_id': milestone['id'], 'p_amount': 10,
                 'p_client_request_id': str(uuid.uuid5(uuid.UUID(self.data['run']), 'presenter-reset-test'))}, owner)
        profile = self.request('GET', '/rest/v1/profiles?select=eco_points,available_eco_points,xp', account=owner)[0]
        require(profile == {'eco_points': 20, 'available_eco_points': 10, 'xp': 20}, 'Consumed presenter totals mismatch')
        goal = self.milestone(observer)
        require(goal['current_points'] == 100 and goal['status'] == 'AwaitingVerification', 'Second-user goal mismatch')
        require(any(row['activity_id'] == action for row in self.rpc('get_community_feed', {'p_limit': 100}, observer)),
                'Second-user feed missing presenter drop')
        self.data['state'] = 'consumed-reset-test'
        self.data['reset_test'] = {'activity': action, 'checkin': checkin, 'photo': photo,
                                   'verification': 'synthetic trusted finalizer', 'gps': 'simulated'}
        save(self.path, self.data)
        print('PASS consumed reset fixture: private photo, quest, 20/10/20 balance, second-user feed and 100/100 goal')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['accounts', 'seed-sql', 'contribute', 'validate', 'reset-sql', 'reset-accounts', 'exercise-reset'])
    parser.add_argument('manifest', type=Path)
    options = parser.parse_args()
    require(options.command == 'accounts' or options.manifest.exists(), 'Manifest missing')
    demo = Demo(options.manifest)
    if options.command in ['seed-sql', 'reset-sql']:
        validate_manifest(demo.data, demo.url)
        print(seed_sql(demo.data) if options.command == 'seed-sql' else reset_sql(demo.data))
    else:
        getattr(demo, options.command.replace('-', '_'))()


if __name__ == '__main__':
    main()
