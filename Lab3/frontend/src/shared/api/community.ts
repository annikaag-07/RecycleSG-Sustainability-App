import { supabase } from './supabase';
import { ApiError, unwrap } from './errors';
import type { CommunityFeedItem, LeaderboardEntry, LeaderboardPeriod } from './types';

/**
 * By lifetime Eco Points (`all_time`, get_leaderboard) or Eco Points from recycling verified since Monday 00:00
 * Singapore time (`week`, get_weekly_leaderboard; quest rewards don't count). Public. The server caps `limit` at 100.
 */
export async function getLeaderboard(limit = 50, period: LeaderboardPeriod = 'all_time'): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc(period === 'week' ? 'get_weekly_leaderboard' : 'get_leaderboard', { p_limit: limit });
  // PGRST202: a backend from before get_weekly_leaderboard existed.
  if (error?.code === 'PGRST202') throw new ApiError('The weekly leaderboard isn’t on the server yet.', 'not_available');
  return unwrap({ data, error });
}

/** The latest verified recycling across Singapore, newest first, without names. Public. The server caps `limit` at 100. */
export async function getCommunityFeed(limit = 20): Promise<CommunityFeedItem[]> {
  return unwrap(await supabase.rpc('get_community_feed', { p_limit: limit }));
}
