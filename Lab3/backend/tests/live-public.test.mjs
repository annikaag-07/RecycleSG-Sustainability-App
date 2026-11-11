// Explicit opt-in only; npm test remains credential-free/offline.
// Run: node --env-file=../../frontend/.env --test live-public.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && key, 'Supply frontend environment; never use a service-role key.');

async function request(path, body) {
  const response = await fetch(`${url}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'count=exact' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  return { response, data: await response.json() };
}

test('live public material catalogue has nine categories', async () => {
  const { response, data } = await request('/rest/v1/material_types?select=name');
  assert.equal(response.status, 200);
  assert.equal(data.length, 9);
  assert.ok(data.some(row => row.name === 'Plastic'));
});

test('live NEA seed contains 12,300 recycling points alongside demo fixtures', async () => {
  const { response } = await request('/rest/v1/recycling_points?select=id&source=eq.NEA%20Recycling%20Bins&limit=1');
  assert.ok(response.ok); // PostgREST returns 206 for counted partial ranges.
  assert.match(response.headers.get('content-range'), /\/12300$/);
});

test('live Plastic search returns compatible points', async () => {
  const { response, data } = await request('/rest/v1/rpc/search_recycling_points_by_material?limit=3', { p_material: 'Plastic' });
  assert.ok(response.ok);
  assert.equal(data.length, 3);
});

test('live nearby search calculates distance', async () => {
  const { response, data } = await request('/rest/v1/rpc/search_nearby_recycling_points',
    { p_latitude: 1.35, p_longitude: 103.7, p_radius_km: 5, p_limit: 3 });
  assert.equal(response.status, 200);
  assert.equal(data.length, 3);
  assert.ok(data.every(row => row.distance_km >= 0 && row.distance_km <= 5));
});

test('live public quests, badges and feed are reachable', async () => {
  for (const table of ['quests', 'badges']) {
    const { response, data } = await request(`/rest/v1/${table}?select=id&limit=1`);
    assert.ok(response.ok);
    assert.equal(data.length, 1);
  }
  const { response, data } = await request('/rest/v1/rpc/get_community_feed', { p_limit: 5 });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
});

test('anonymous users cannot read private profiles or legacy payments', async () => {
  for (const table of ['profiles', 'payments']) {
    const { response } = await request(`/rest/v1/${table}?select=id&limit=1`);
    const allowedStatuses = table === 'payments' ? [401, 403, 404] : [401, 403];
    assert.ok(allowedStatuses.includes(response.status), `${table}: expected inaccessible, got ${response.status}`);
  }
});

test('anonymous users cannot invoke trusted finalizer', async () => {
  const { response } = await request('/rest/v1/rpc/finalize_recycling_activity', {
    p_activity_id: -1, p_user_id: '00000000-0000-0000-0000-000000000000',
    p_status: 'Verified', p_predicted_material: 'Plastic', p_confidence: 0.99,
  });
  assert.ok([401, 403].includes(response.status));
});

test('live Auth settings endpoint is reachable (not a login test)', async () => {
  const { response, data } = await request('/auth/v1/settings');
  assert.equal(response.status, 200);
  assert.equal(typeof data.disable_signup, 'boolean');
});
