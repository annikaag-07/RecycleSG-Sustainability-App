"""Thin trusted adapter. No model/DB keys are accepted from browser input."""
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode

from fastapi import HTTPException
from classifier import classify_image, MissingKeyError


class SupabaseGateway:
    def __init__(self):
        self.url = os.getenv('SUPABASE_URL', '').rstrip('/')
        self.key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
        if not self.url or not self.key:
            raise HTTPException(503, 'Verification service is not configured.')

    def request(self, path, *, token=None, body=None, binary=False):
        headers = {'apikey': self.key, 'Authorization': 'Bearer ' + (token or self.key)}
        data = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body).encode()
        try:
            with urlopen(Request(self.url + path, data=data, headers=headers), timeout=15) as response:
                if binary:
                    # Same bound as private photo bucket; do not read arbitrarily large objects.
                    payload = response.read(5 * 1024 * 1024 + 1)
                    return payload, response.headers.get_content_type()
                return json.load(response)
        except HTTPError as exc:
            if path.startswith('/auth/'):
                raise HTTPException(401, 'Please log in again.') from exc
            raise HTTPException(502, 'Unable to read or update recycling. Retry safely.') from exc
        except (URLError, TimeoutError) as exc:
            raise HTTPException(503, 'Verification temporarily unavailable. Retry safely.') from exc

    def user(self, token):
        return self.request('/auth/v1/user', token=token)

    def activity(self, activity_id, user_id):
        rows = self.request('/rest/v1/recycling_actions?' + urlencode({
            'id': f'eq.{activity_id}', 'user_id': f'eq.{user_id}', 'select': '*'}))
        if not rows:
            raise HTTPException(404, 'Activity not found.')
        return rows[0]

    def material(self, material_id):
        rows = self.request('/rest/v1/material_types?' + urlencode({'id': f'eq.{material_id}', 'select': 'name'}))
        if not rows:
            raise HTTPException(422, 'Unknown recycling material.')
        return rows[0]['name']

    def photo(self, path):
        return self.request('/storage/v1/object/authenticated/recycling-photos/' + quote(path, safe='/'), binary=True)

    def finalize(self, activity, status, result):
        rows = self.request('/rest/v1/rpc/finalize_recycling_activity', body={
            'p_activity_id': activity['id'], 'p_user_id': activity['user_id'],
            'p_status': status, 'p_predicted_material': result['material'],
            'p_confidence': result['confidence'],
        })
        return rows[0]


def outcome(activity, message):
    return {'activity_id': activity['id'], 'status': activity['verification_status'],
            'material': activity.get('cv_predicted_material'),
            'confidence': activity.get('cv_confidence'), 'message': message}


def verify_activity(activity_id, token, gateway=None, classify=None):
    gateway = gateway or SupabaseGateway()
    classify = classify or classify_image
    user = gateway.user(token)
    activity = gateway.activity(activity_id, user['id'])
    # Defense in depth, even if a gateway implementation fails to filter correctly.
    if activity['user_id'] != user['id']:
        raise HTTPException(404, 'Activity not found.')
    if activity['verification_status'] != 'Pending':
        return outcome(activity, 'This activity has already been checked.')
    path = activity.get('photo_url')
    if not path or not path.startswith(user['id'] + '/') or '..' in path:
        raise HTTPException(422, 'This activity needs a valid stored photo.')
    data, mime = gateway.photo(path)
    if not data or len(data) > 5 * 1024 * 1024 or mime not in {'image/jpeg', 'image/png', 'image/webp'}:
        raise HTTPException(422, 'The stored photo is empty, too large or unsupported.')
    try:
        result = classify(data, mime, path.rsplit('/', 1)[-1])
    except MissingKeyError as exc:
        raise HTTPException(503, 'Recognition is not configured. No points awarded.') from exc
    if result['status'] != 'ok':
        return outcome(activity, 'Recognition is uncertain or unavailable. No points awarded; you can retry verification.')
    expected = gateway.material(activity['material_type_id'])
    status = 'Verified' if expected.casefold() == result['material'].casefold() else 'Rejected'
    saved = gateway.finalize(activity, status, result)
    return outcome(saved, 'Material matched (prototype check, not proof of disposal).' if saved['verification_status'] == 'Verified'
                   else 'The recognized material did not match the submitted material.')
