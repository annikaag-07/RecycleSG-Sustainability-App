import { supabase } from './supabase';
import { unwrap } from './errors';
import type { CheckIn, LatLng, RecyclingAction, RewardTransaction } from './types';

/** Server rules (see API_ENDPOINTS.md): within 100 m, 30-min cooldown per point, 10 per UTC day. Returns the check-in ID. */
export async function createCheckIn(recyclingPointId: number, { latitude, longitude }: LatLng): Promise<number> {
  return unwrap(
    await supabase.rpc('create_gps_checkin', {
      p_recycling_point_id: recyclingPointId,
      p_latitude: latitude,
      p_longitude: longitude,
    }),
  );
}

/**
 * Must be within 15 min of the check-in. Starts as 'Pending'; rewards only arrive once verified server-side. Returns the
 * action ID. `photoPath` is the photo's path in the recycling-photos bucket (`<user id>/...`, see api.photos), uploaded
 * first: the server checks it's there and in the user's own folder.
 */
export async function submitRecyclingActivity(
  checkInId: number,
  materialTypeId: number,
  quantity: number,
  photoPath?: string,
): Promise<number> {
  return unwrap(
    await supabase.rpc('submit_recycling_activity', {
      p_check_in_id: checkInId,
      p_material_type_id: materialTypeId,
      p_quantity: quantity,
      ...(photoPath ? { p_photo_url: photoPath } : {}),
    }),
  );
}

export async function listMyCheckIns(limit = 20): Promise<CheckIn[]> {
  return unwrap(await supabase.from('check_ins').select('*').order('checked_in_at', { ascending: false }).limit(limit));
}

export async function listMyRecyclingActions(limit = 50): Promise<RecyclingAction[]> {
  return unwrap(
    await supabase.from('recycling_actions').select('*').order('created_at', { ascending: false }).limit(limit),
  );
}

/** The reward for one verified recycling activity, or null if it hasn't been verified. */
export async function getRewardForAction(actionId: number): Promise<RewardTransaction | null> {
  return unwrap(await supabase.from('reward_transactions').select('*').eq('recycling_action_id', actionId).maybeSingle());
}

/** Newest first. Includes quest rewards, which have `recycling_action_id` null and `quest_progress_id` set. */
export async function listMyRewards(limit = 50): Promise<RewardTransaction[]> {
  return unwrap(
    await supabase.from('reward_transactions').select('*').order('created_at', { ascending: false }).limit(limit),
  );
}
