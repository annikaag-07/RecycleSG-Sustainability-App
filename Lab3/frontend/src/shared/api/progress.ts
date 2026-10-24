// Quests and badges. Progress only moves when the server marks a recycling activity Verified; the app just reads it.
import { supabase } from './supabase';
import { unwrap } from './errors';
import type { Badge, QuestClaimResult, QuestProgress, Quest, UserBadge, VerificationStatus } from './types';

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
