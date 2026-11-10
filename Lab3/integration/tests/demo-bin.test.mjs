import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './mock-server.mjs';

test('N4 demo seed is repeatable and supports normal nearby search and check-in', async () => {
  const { db } = await fixture();
  try {
    const seed = await readFile(new URL('../../backend/supabase/demo/ntu_n4.sql', import.meta.url), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    const points = (await db.query("SELECT * FROM recycling_points WHERE source='SC2006 classroom demo (NTU N4)'" )).rows;
    assert.equal(points.length, 1);
    const point = points[0];
    assert.match(point.name, /Demo recycling bin/);
    const materials = (await db.query('SELECT mt.name FROM recycling_point_materials rpm JOIN material_types mt ON mt.id=rpm.material_type_id WHERE rpm.recycling_point_id=$1 ORDER BY mt.name', [point.id])).rows;
    assert.deepEqual(materials.map(row => row.name), ['Glass', 'Metal', 'Paper', 'Plastic']);
    await db.exec('SET ROLE authenticated');
    const nearby = (await db.query('SELECT * FROM search_nearby_recycling_points($1,$2,0.1,20)', [point.latitude, point.longitude])).rows;
    assert.equal(nearby[0].id, point.id);
    const matching = (await db.query("SELECT * FROM search_recycling_points_by_material('Plastic')")).rows;
    assert.ok(matching.some(row => row.id === point.id));
    await assert.rejects(db.query('SELECT create_gps_checkin($1,1.354,103.945)', [point.id]), /Too far/);
    const checkin = (await db.query('SELECT create_gps_checkin($1,$2,$3) AS id', [point.id, point.latitude, point.longitude])).rows[0];
    assert.ok(checkin.id);
  } finally {
    await db.close();
  }
});
