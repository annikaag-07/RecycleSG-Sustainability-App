import { supabase } from './supabase';
import { ApiError, unwrap } from './errors';
import type { CommunityFeedItem, LeaderboardEntry, LeaderboardPeriod } from './types';

/**
 * By lifetime Eco Points (`all_time`) or verified Eco Points earned since Monday, Singapore time (`week`). Public.
 * The server caps `limit` at 100. `week` needs the `p_period` parameter the backend is adding (API_ENDPOINTS.md,
 * Proposed endpoints); until then it throws ApiError 'not_available'.
 */
export async function getLeaderboard(limit = 50, period: LeaderboardPeriod = 'all_time'): Promise<LeaderboardEntry[]> {
  // All time leaves p_period out, so it works with both the current one-parameter function and the new one.
  const args = period === 'all_time' ? { p_limit: limit } : { p_limit: limit, p_period: period };
  const { data, error } = await supabase.rpc('get_leaderboard', args);
  // PGRST202: no get_leaderboard that takes p_period yet.
  if (error?.code === 'PGRST202') throw new ApiError('The weekly leaderboard isn’t on the server yet.', 'not_available');
  return unwrap({ data, error });
}

/** The latest verified recycling across Singapore, newest first. Public. The server caps `limit` at 100. */
export async function getCommunityFeed(limit = 20): Promise<CommunityFeedItem[]> {
  return unwrap(await supabase.rpc('get_community_feed', { p_limit: limit }));
}
