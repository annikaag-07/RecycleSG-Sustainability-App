import type { WeeklyInterval } from '@/shared/hours';

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

/** A row from find_recycling_points: the nearby shape plus the server's open-now answer. */
export type FinderPoint = NearbyRecyclingPoint & {
  /** True/false from the point's weekly schedule in Singapore time; null when its hours are unknown. */
  is_open: boolean | null;
};

/**
 * find_recycling_points (FINDER_API.md) — nearest first, active points only, max limit 100.
 * `openOnly` filters on the server *before* the limit, so a full page of open points comes back.
 */
export async function findPoints(
  { latitude, longitude }: LatLng,
  radiusKm = 1,
  limit = 20,
  openOnly = false,
): Promise<FinderPoint[]> {
  return unwrap(
    await supabase.rpc('find_recycling_points', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_km: radiusKm,
      p_limit: limit,
      p_open_only: openOnly,
    }),
  );
}

/** recycling_point_open_now — true, false, or null when the point's hours are unknown. */
export async function isOpenNow(pointId: number): Promise<boolean | null> {
  return unwrap<boolean | null>(await supabase.rpc('recycling_point_open_now', { p_point_id: pointId }));
}

export type PointDetailWithSchedule = RecyclingPointDetail & {
  /** Weekly schedule (null = unknown). Absent when the detail came from the offline cache. */
  weekly_hours?: WeeklyInterval[] | null;
};

type PointRow = Omit<PointDetailWithSchedule, 'materials'> & {
  recycling_point_materials: { material_types: MaterialType | null }[];
};

export async function getPointDetail(id: number): Promise<PointDetailWithSchedule> {
  const row = unwrap<PointRow>(
    await supabase
      .from('recycling_points')
      .select(
        'id, name, address, latitude, longitude, operating_hours, weekly_hours, status, source, last_updated, ' +
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

export type PointExtras = { materials: string[]; operatingHours: string | null };

/**
 * Accepted material names and opening hours per point. The search RPCs return neither, and there is no
 * combined nearby + material search, so screens fetch these separately to label and filter results.
 */
export async function getPointExtras(pointIds: number[]): Promise<Map<number, PointExtras>> {
  const result = new Map<number, PointExtras>();
  if (pointIds.length === 0) return result;
  // material_types is a many-to-one embed, so PostgREST returns an object; without generated DB types
  // supabase-js infers an array, hence the cast.
  const rows = unwrap(
    await supabase
      .from('recycling_points')
      .select('id, operating_hours, recycling_point_materials(material_types(name))')
      .in('id', pointIds),
  ) as unknown as {
    id: number;
    operating_hours: string | null;
    recycling_point_materials: { material_types: { name: string } | null }[];
  }[];
  for (const row of rows) {
    result.set(row.id, {
      operatingHours: row.operating_hours,
      materials: row.recycling_point_materials.flatMap((m) => (m.material_types ? [m.material_types.name] : [])),
    });
  }
  return result;
}
