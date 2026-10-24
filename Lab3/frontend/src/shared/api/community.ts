import { supabase } from './supabase';
import { unwrap } from './errors';
import type { CommunityFeedItem, LeaderboardEntry } from './types';

/** All-time, by lifetime Eco Points. Public. The server caps `limit` at 100 and includes people with 0 points. */
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  return unwrap(await supabase.rpc('get_leaderboard', { p_limit: limit }));
}

/** The latest verified recycling across Singapore, newest first. Public. The server caps `limit` at 100. */
export async function getCommunityFeed(limit = 20): Promise<CommunityFeedItem[]> {
  return unwrap(await supabase.rpc('get_community_feed', { p_limit: limit }));
}
