// Quests and badges. Progress only moves when the server marks a recycling activity Verified; the app just reads it.
import { supabase } from './supabase';
import { ApiError, unwrap } from './errors';
import type {
  Badge,
  BadgeProgress,
  LevelProgress,
  QuestClaimResult,
  QuestProgress,
  Quest,
  RewardEstimate,
  UserBadge,
  VerificationStatus,
} from './types';

/** Active quests. Public. */
export async function listQuests(): Promise<Quest[]> {
  return unwrap(await supabase.from('quests').select('*').order('target_actions').order('id'));
}

/** The caller's progress rows for the given periods ('YYYY-MM-DD'). A quest with no row has no progress yet. */
export async function listMyQuestProgress(periodStarts: string[]): Promise<QuestProgress[]> {
  return unwrap(await supabase.from('user_quest_progress').select('*').in('period_start', periodStarts));
}

/** Credits a completed quest's Eco Points and XP. The server refuses a second claim ("Reward already claimed"). */
export async function claimQuestReward(questId: number, periodStart: string): Promise<QuestClaimResult> {
  const rows = unwrap<QuestClaimResult[]>(
    await supabase.rpc('claim_quest_reward', { p_quest_id: questId, p_period_start: periodStart }),
  );
  return rows[0]!;
}

/** Every badge, easiest first. Public. */
export async function listBadges(): Promise<Badge[]> {
  return unwrap(await supabase.from('badges').select('*').order('required_verified_actions'));
}

/** Every badge with the caller's progress and, once earned, when. Streak and region badges count from all past recycling. */
export async function listMyBadgeProgress(): Promise<BadgeProgress[]> {
  return unwrap(await supabase.rpc('list_my_badge_progress'));
}

/**
 * Consecutive Singapore days with verified recycling. Yesterday's streak still counts until today ends, so it doesn't
 * reset at midnight before you've had a chance to recycle.
 */
export async function getMyStreak(): Promise<number> {
  return unwrap<number>(await supabase.rpc('get_my_streak')) ?? 0;
}

/** The caller's level and how far it is to the next one, under the level step an admin has set. */
export async function getMyLevelProgress(): Promise<LevelProgress> {
  const rows = unwrap<LevelProgress[]>(await supabase.rpc('get_my_level_progress'));
  if (!rows[0]) throw new ApiError('Your profile could not be found.', 'P0002');
  return rows[0];
}

/**
 * What logging `quantity` items of a material would earn once verified, at the current rates and seasonal bonus. Pass
 * a pending drop's `created_at` as `submittedAt`, since the bonus depends on when it was logged. Verified drops have
 * their actual payout in reward_transactions instead.
 */
export async function estimateRecyclingReward(materialTypeId: number, quantity: number, submittedAt?: string): Promise<RewardEstimate> {
  const args: Record<string, unknown> = { p_material_type_id: materialTypeId, p_quantity: quantity };
  if (submittedAt) args.p_submitted_at = submittedAt;
  const rows = unwrap<RewardEstimate[]>(await supabase.rpc('estimate_recycling_reward', args));
  return rows[0]!;
}

export async function listMyBadges(): Promise<UserBadge[]> {
  return unwrap(await supabase.from('user_badges').select('*').order('earned_at'));
}

/** How many of the user's recycling activities have this status. Badges count Verified activities, not items. */
export async function countMyActions(userId: string, status: VerificationStatus): Promise<number> {
  const { count, error } = await supabase
    .from('recycling_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('verification_status', status);
  if (error) unwrap({ data: null, error });
  return count ?? 0;
}
