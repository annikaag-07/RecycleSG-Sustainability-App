import { supabase } from './supabase';
import { unwrap } from './errors';
import type { EditableProfileFields, EnvironmentalImpact, Profile } from './types';

/** RLS only allows reading your own row — other users' profiles are not available yet. */
export async function getMyProfile(userId: string): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single<Profile>());
}

/** Only username, display_name, avatar_url and bio are writable. */
export async function updateMyProfile(userId: string, fields: EditableProfileFields): Promise<Profile> {
  return unwrap(await supabase.from('profiles').update(fields).eq('id', userId).select('*').single<Profile>());
}

export async function getMyEnvironmentalImpact(userId: string): Promise<EnvironmentalImpact> {
  const rows = unwrap<EnvironmentalImpact[]>(
    await supabase.rpc('get_user_environmental_impact', { p_user_id: userId }),
  );
  return rows[0] ?? { total_verified_actions: 0, total_recycled_units: 0, estimated_co2_saved_kg: 0, tree_equivalents: 0 };
}
