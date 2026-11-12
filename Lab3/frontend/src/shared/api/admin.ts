// Administrator workflows (REQ-12.1–12.4). Contracts: Lab3/backend/FINDER_API.md, BACKEND_IMPLEMENTATION.md
// ("Point report endpoints") and Lab3/backend/PROGRESS_API.md ("Configure gamification").
// Every function here is checked against app_admins on the server and fails with 42501 for anyone else.
import type { WeeklyInterval } from '@/shared/hours';

import { supabase } from './supabase';
import { ApiError, toApiError, unwrap } from './errors';
import type { PointStatus, QuestType } from './types';

/** Turns the documented admin error codes into something an administrator can act on. */
export function adminErrorMessage(e: unknown): string {
  const err = toApiError(e);
  switch (err.code) {
    case '42501':
      return 'Your account is not an administrator on the server.';
    case 'P0002':
      return 'That item no longer exists or was already handled. Refresh and try again.';
    case '23505':
      return 'That name is already used. Choose a different one.';
    case '23503':
      return 'A selected material or point no longer exists. Refresh and try again.';
    case '22023':
    case '23502':
    case '23514':
      return `Check the fields: ${err.message}`;
    default:
      return err.message;
  }
}

// ---------------------------------------------------------------------------------------------
// Recycling points (REQ-12.1)
// ---------------------------------------------------------------------------------------------

export type AdminPoint = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: PointStatus;
  region: string | null;
  source: string | null;
  is_active: boolean;
  /** null = hours unknown, [] = known to be closed all week. */
  weekly_hours: WeeklyInterval[] | null;
  operating_hours: string | null;
  material_ids: number[];
};

export type PointInput = Omit<AdminPoint, 'id'>;

/** Pages by ID: pass the last row's id as `afterId`. `active` null = all, true/false = only active/inactive. */
export async function listPoints(afterId: number | null = null, limit = 20, active: boolean | null = null): Promise<AdminPoint[]> {
  return unwrap(await supabase.rpc('admin_list_points', { p_after_id: afterId, p_limit: limit, p_active: active }));
}

/**
 * Creates (id null) or replaces a point, including its materials and hours, in one transaction. For edits send the full
 * record. Use `is_active` to deactivate/reactivate; removal goes through removePoint. Returns the point ID.
 */
export async function savePoint(id: number | null, point: PointInput): Promise<number> {
  return unwrap(await supabase.rpc('admin_save_point', { p_point_id: id, p_point: point }));
}

/** 'deleted' when nothing references the point, 'archived' when history needs the row (it leaves public search). */
export async function removePoint(id: number): Promise<'deleted' | 'archived'> {
  return unwrap(await supabase.rpc('admin_remove_point', { p_point_id: id }));
}

// ---------------------------------------------------------------------------------------------
// Reported recycling-point issues (REQ-12.2)
// ---------------------------------------------------------------------------------------------

export type PendingPointReport = {
  id: number;
  recycling_point_id: number;
  category: 'full' | 'missing_or_damaged' | 'wrong_info' | 'contaminated';
  description: string | null;
  created_at: string;
};

export type ReportResolution = 'Resolved' | 'Dismissed';

/** Pending reports, newest first. Pass the last row's id as `beforeId` for the next page. */
export async function listPointReports(beforeId: number | null = null, limit = 20): Promise<PendingPointReport[]> {
  return unwrap(await supabase.rpc('admin_list_point_reports', { p_before_id: beforeId, p_limit: limit }));
}

/** Closes one pending report. The point itself is updated separately (savePoint). */
export async function reviewPointReport(id: number, resolution: ReportResolution, note: string | null): Promise<ReportResolution> {
  return unwrap(await supabase.rpc('admin_review_point_report', { p_report_id: id, p_resolution: resolution, p_note: note }));
}

/** Names and addresses for report rows. Reads the public table, so inactive points are simply missing. */
export async function pointLabels(ids: number[]): Promise<Map<number, { name: string; address: string }>> {
  const map = new Map<number, { name: string; address: string }>();
  if (ids.length === 0) return map;
  const rows = unwrap<{ id: number; name: string; address: string }[]>(
    await supabase.from('recycling_points').select('id, name, address').in('id', ids),
  );
  for (const r of rows) map.set(r.id, { name: r.name, address: r.address });
  return map;
}

// ---------------------------------------------------------------------------------------------
// Usage and impact statistics (REQ-12.4)
// ---------------------------------------------------------------------------------------------

export type UsageStats = {
  active_users: number;
  verified_actions: number;
  most_used_points: { id: number; name: string; check_ins: number }[];
  items_by_material: { id: number; name: string; quantity: number }[];
};

/** Singapore calendar dates 'YYYY-MM-DD'; `from` inclusive, `until` exclusive. */
export async function usageStats(from: string, until: string): Promise<UsageStats> {
  return unwrap(await supabase.rpc('admin_usage_stats', { p_from: from, p_until: until }));
}

// ---------------------------------------------------------------------------------------------
// Gamification rules (REQ-12.3)
// ---------------------------------------------------------------------------------------------

export type MaterialRewardRule = { material_id: number; name: string; points_per_unit: number; xp_per_unit: number };
export type QuestRule = {
  id: number;
  title: string;
  description: string | null;
  quest_type: QuestType;
  target_actions: number;
  reward_eco_points: number;
  reward_xp: number;
  is_active: boolean;
};
export type BadgeCriterion = 'verified_actions' | 'streak' | 'regions';
export type BadgeRule = {
  id: number;
  name: string;
  description: string | null;
  criterion: BadgeCriterion;
  /** The badge's target (actions, streak days or regions, depending on the criterion). */
  required_verified_actions: number;
};
export type SeasonRule = { id: number; name: string; starts_at: string; ends_at: string; multiplier: number };

export type GameRules = {
  xp_step: number;
  materials: MaterialRewardRule[];
  quests: QuestRule[];
  badges: BadgeRule[];
  seasons: SeasonRule[];
};

export async function getGameRules(): Promise<GameRules> {
  const rules = unwrap<GameRules | null>(await supabase.rpc('admin_get_game_rules'));
  if (!rules) throw new ApiError('The server returned no game rules.');
  return rules;
}

/** 1–1000 each (server-checked). */
export async function setMaterialReward(materialId: number, pointsPerUnit: number, xpPerUnit: number) {
  unwrap(
    await supabase.rpc('admin_set_material_reward', {
      p_material_id: materialId,
      p_points_per_unit: pointsPerUnit,
      p_xp_per_unit: xpPerUnit,
    }),
  );
}

/** XP per level. Users keep a level they already reached. */
export async function setLevelStep(xpStep: number) {
  unwrap(await supabase.rpc('admin_set_level_step', { p_xp_step: xpStep }));
}

export async function saveQuest(id: number | null, q: Omit<QuestRule, 'id'>): Promise<number> {
  return unwrap(
    await supabase.rpc('admin_save_quest', {
      p_id: id,
      p_title: q.title,
      p_description: q.description,
      p_quest_type: q.quest_type,
      p_target_actions: q.target_actions,
      p_reward_eco_points: q.reward_eco_points,
      p_reward_xp: q.reward_xp,
      p_is_active: q.is_active,
    }),
  );
}

/** Saving applies to existing history: anyone who now qualifies is awarded the badge. */
export async function saveBadge(id: number | null, b: { name: string; description: string | null; criterion: BadgeCriterion; target: number }): Promise<number> {
  return unwrap(
    await supabase.rpc('admin_save_badge', {
      p_id: id,
      p_name: b.name,
      p_description: b.description,
      p_criterion: b.criterion,
      p_target: b.target,
    }),
  );
}

/** Multiplier 1–10; set 1 to switch an event's bonus off. Times are ISO strings with an offset. */
export async function saveSeason(id: number | null, s: Omit<SeasonRule, 'id'>): Promise<number> {
  return unwrap(
    await supabase.rpc('admin_save_season', {
      p_id: id,
      p_name: s.name,
      p_starts_at: s.starts_at,
      p_ends_at: s.ends_at,
      p_multiplier: s.multiplier,
    }),
  );
}
