"""Opt-in hosted smoke test; creates then deletes only its own test account/photo.

Run from CV: uv run --no-project --with-requirements requirements-test.txt python live_smoke.py
Uses real Supabase and Gemini with a synthetic blank PNG, not a demo bottle.
GPS coordinates are simulated. FastAPI is exercised in-process, not a browser.
"""
import json
import os
import secrets
import struct
import uuid
import zlib
from pathlib import Path
from unittest.mock import patch

import httpx
from dotenv import dotenv_values, load_dotenv
from fastapi.testclient import TestClient

load_dotenv(Path(__file__).with_name('.env'))
os.environ.pop('CV_MOCK', None)
from app import app
import verification

url = os.environ['SUPABASE_URL'].rstrip('/')
assert url == 'https://zwyibrksagddbrqiqaqf.supabase.co', 'Only the approved disposable project is allowed'
admin = os.environ['SUPABASE_SERVICE_ROLE_KEY']
anon = dotenv_values(Path(__file__).parent.parent / 'frontend/.env')['EXPO_PUBLIC_SUPABASE_ANON_KEY']
uid = token = photo = None
http = httpx.Client(timeout=25)


def call(method, path, *, key=admin, bearer=None, payload=None, content=None, mime=None):
    headers = {'apikey': key, 'Authorization': 'Bearer ' + (bearer or key)}
    if mime:
        headers['Content-Type'] = mime
    r = http.request(method, url + path, headers=headers, json=payload, content=content)
    if not r.is_success:
        # Do not print request headers, access tokens, raw provider errors or secrets.
        raise RuntimeError(f'{method} {path.split("?")[0]}: HTTP {r.status_code}')
    return r.json() if r.content else None


def user(method, path, **kw):
    return call(method, path, key=anon, bearer=token, **kw)


def png():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 64, 64, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff' * 192) * 64)) + chunk(b'IEND', b''))


try:
    email = f'recyclesg-smoke-{uuid.uuid4().hex}@example.com'
    password = secrets.token_urlsafe(32)
    account = call('POST', '/auth/v1/admin/users', payload={
        'email': email, 'password': password, 'email_confirm': True,
        'user_metadata': {'display_name': 'Temporary integration smoke test'}})
    uid = account['id']
    print('PASS: admin-created confirmed temporary account (no email sent)', flush=True)
    session = call('POST', '/auth/v1/token?grant_type=password', key=anon,
                   payload={'email': email, 'password': password})
    token = session['access_token']
    profile = user('GET', '/rest/v1/profiles?select=id,eco_points')
    assert len(profile) == 1 and profile[0]['id'] == uid and profile[0]['eco_points'] == 0
    print('PASS: real password login and signup-trigger profile', flush=True)
    point = user('GET', '/rest/v1/recycling_points?select=id,latitude,longitude&limit=1')[0]
    material = user('GET', '/rest/v1/material_types?name=eq.Plastic&select=id')[0]['id']
    checkin = user('POST', '/rest/v1/rpc/create_gps_checkin', payload={
        'p_recycling_point_id': point['id'], 'p_latitude': point['latitude'], 'p_longitude': point['longitude']})
    print('PASS: check-in with explicitly simulated coordinates', flush=True)
    photo = f'{uid}/smoke-{uuid.uuid4().hex}.png'
    user('POST', '/storage/v1/object/recycling-photos/' + photo, content=png(), mime='image/png')
    downloaded, mime = verification.SupabaseGateway().photo(photo)
    assert downloaded == png() and mime == 'image/png'
    print('PASS: owned private upload and trusted-server download', flush=True)
    action = user('POST', '/rest/v1/rpc/submit_recycling_activity', payload={
        'p_check_in_id': checkin, 'p_material_type_id': material, 'p_quantity': 1, 'p_photo_url': photo})
    print('PASS: authenticated Pending submission', flush=True)
    observed = []
    real_classify = verification.classify_image

    def observe(*args):
        result = real_classify(*args)
        observed.append(result)
        return result

    with patch.object(verification, 'classify_image', side_effect=observe), TestClient(app) as client:
        response = client.post('/verify', json={'activity_id': action},
                               headers={'Authorization': 'Bearer ' + token})
    assert response.status_code == 200, f'verify HTTP {response.status_code}'
    result = observed[0]
    print('Real Gemini result: ' + json.dumps({k: result.get(k) for k in ['status', 'model', 'latency_ms', 'material']}), flush=True)
    if result['status'] == 'unavailable':
        error = result.get('error', '')
        for secret in [admin, os.environ.get('GEMINI_API_KEY', ''), token]:
            if secret:
                error = error.replace(secret, '[REDACTED]')
        print('Provider diagnostic: ' + error, flush=True)
    assert result['status'] == 'unsure', 'Blank image must yield unsure; real recognition did not pass'
    assert response.json()['status'] == 'Pending'
    assert user('GET', '/rest/v1/profiles?select=eco_points')[0]['eco_points'] == 0
    print('PASS: real Gemini uncertainty → Pending, zero points', flush=True)
finally:
    # Storage must be removed before Auth deletion. Never clean up pre-existing data.
    if photo:
        call('DELETE', '/storage/v1/object/recycling-photos', payload={'prefixes': [photo]})
        print('CLEANUP: removed synthetic test photo', flush=True)
    if token:
        user('POST', '/auth/v1/logout?scope=global')
    if uid:
        call('DELETE', '/auth/v1/admin/users/' + uid)
        print('CLEANUP: removed temporary Auth user and cascading test rows', flush=True)
    http.close()
