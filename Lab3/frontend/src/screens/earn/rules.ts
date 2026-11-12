// Copies of the server's check-in and quest rules (Lab3/backend/supabase/migrations, feature/backend @ 4e661f0).
// The server enforces all of them; the app only uses them to explain a limit before the user runs into it.
// Rewards and levels aren't copied here: an admin sets them, so screens read them from estimate_recycling_reward and
// get_my_level_progress.

import type { QuestType } from '@/shared/api';

/** create_gps_checkin: more than 100 m from the point is "Too far from recycling point". */
export const CHECK_IN_RADIUS_M = 100;
/** enforce_checkin_limits: one check-in per point every 30 minutes. */
export const CHECK_IN_COOLDOWN_MIN = 30;
/** enforce_checkin_limits: at most 10 check-ins per UTC day. */
export const DAILY_CHECK_IN_LIMIT = 10;
/** submit_recycling_activity: a check-in can only be logged against for 15 minutes. */
export const LOG_WINDOW_MIN = 15;
/** submit_recycling_activity: quantity must be 1–100. */
export const MAX_QUANTITY = 100;

const MINUTE = 60_000;

export function cooldownEndsAt(lastCheckInAt: string): Date {
  return new Date(new Date(lastCheckInAt).getTime() + CHECK_IN_COOLDOWN_MIN * MINUTE);
}

export function logDeadline(checkedInAt: string): Date {
  return new Date(new Date(checkedInAt).getTime() + LOG_WINDOW_MIN * MINUTE);
}

/** The daily limit resets at midnight UTC, which is 08:00 in Singapore. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + 24 * 60 * MINUTE);
}

// ---------------------------------------------------------------------------------------------
// Quest periods (track_verified_quest_progress). Unlike the check-in limit, they turn over at midnight Singapore time.
// ---------------------------------------------------------------------------------------------

const DAY = 24 * 60 * MINUTE;
/** Singapore is UTC+8 all year (no daylight saving). */
const SGT_OFFSET = 8 * 60 * MINUTE;

/** The Singapore calendar date of `d`, as 'YYYY-MM-DD'. */
const sgDate = (d: Date) => new Date(d.getTime() + SGT_OFFSET).toISOString().slice(0, 10);

/** Midnight in Singapore at the start of the Singapore day containing `now`. */
function startOfSgDay(now: Date): Date {
  return new Date(Date.parse(`${sgDate(now)}T00:00:00Z`) - SGT_OFFSET);
}

/** Midnight in Singapore on the Monday that starts the current week, as Postgres date_trunc('week') counts it. */
function startOfSgWeek(now: Date): Date {
  const day = startOfSgDay(now);
  const weekday = new Date(day.getTime() + SGT_OFFSET).getUTCDay(); // 0 = Sunday, in Singapore
  return new Date(day.getTime() - ((weekday + 6) % 7) * DAY);
}

/** The `period_start` the server files progress under: today (daily), this week's Monday (weekly), or 1970-01-01. */
export function questPeriodStart(type: QuestType, now: Date): string {
  if (type === 'daily') return sgDate(now);
  if (type === 'weekly') return sgDate(startOfSgWeek(now));
  return '1970-01-01';
}

/** When the current period's progress stops counting. Null for one-time quests. */
export function questPeriodEnds(type: QuestType, now: Date): Date | null {
  if (type === 'daily') return new Date(startOfSgDay(now).getTime() + DAY);
  if (type === 'weekly') return new Date(startOfSgWeek(now).getTime() + 7 * DAY);
  return null;
}
