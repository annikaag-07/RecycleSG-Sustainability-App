import { supabase } from './supabase';
import { unwrap } from './errors';
import type {
  LatLng,
  MaterialType,
  NearbyRecyclingPoint,
  RecyclingPointDetail,
  RecyclingPointSummary,
} from './types';

export async function listMaterialTypes(): Promise<MaterialType[]> {
  return unwrap(await supabase.from('material_types').select('id, name, description').order('id'));
}

/** search_recycling_points_by_material — results are sorted by address, not distance. */
export async function searchByMaterial(material: string, page = 0, pageSize = 20): Promise<RecyclingPointSummary[]> {
  const from = page * pageSize;
  return unwrap(
    await supabase.rpc('search_recycling_points_by_material', { p_material: material }).range(from, from + pageSize - 1),
  );
}

/** search_nearby_recycling_points — nearest first, straight-line distance. Max limit 100. */
export async function searchNearby(
  { latitude, longitude }: LatLng,
  radiusKm = 1,
  limit = 20,
): Promise<NearbyRecyclingPoint[]> {
  return unwrap(
    await supabase.rpc('search_nearby_recycling_points', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_km: radiusKm,
      p_limit: limit,
    }),
  );
}

type PointRow = Omit<RecyclingPointDetail, 'materials'> & {
  recycling_point_materials: { material_types: MaterialType | null }[];
};

export async function getPointDetail(id: number): Promise<RecyclingPointDetail> {
  const row = unwrap<PointRow>(
    await supabase
      .from('recycling_points')
      .select(
        'id, name, address, latitude, longitude, operating_hours, status, source, last_updated, ' +
          'recycling_point_materials(material_types(id, name, description))',
      )
      .eq('id', id)
      .single<PointRow>(),
  );
  const { recycling_point_materials, ...point } = row;
  return {
    ...point,
    materials: recycling_point_materials.flatMap((m) => (m.material_types ? [m.material_types] : [])),
  };
}

/** Accepted material names per point, for filtering/labelling search results (no combined search exists). */
export async function getMaterialsForPoints(pointIds: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (pointIds.length === 0) return result;
  // material_types is a many-to-one embed, so PostgREST returns an object; without generated DB types
  // supabase-js infers an array, hence the cast.
  const rows = unwrap(
    await supabase
      .from('recycling_point_materials')
      .select('recycling_point_id, material_types(name)')
      .in('recycling_point_id', pointIds),
  ) as unknown as { recycling_point_id: number; material_types: { name: string } | null }[];
  for (const row of rows) {
    if (!row.material_types) continue;
    const list = result.get(row.recycling_point_id) ?? [];
    list.push(row.material_types.name);
    result.set(row.recycling_point_id, list);
  }
  return result;
}
