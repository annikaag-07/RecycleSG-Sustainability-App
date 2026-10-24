// Copies of the server's check-in, reward and quest rules (Lab3/backend/supabase/migrations, feature/backend @ 3eb5cdd).
// The server enforces all of them; the app only uses them to explain a limit before the user runs into it.
// The SRS has these set by an administrator — once the backend exposes them, read them from there instead.

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
/** award_verified_recycling: 10 Eco Points and 10 XP per item, level = 1 + floor(xp / 100). */
export const POINTS_PER_ITEM = 10;
export const XP_PER_LEVEL = 100;

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
// Quest periods (track_verified_quest_progress). Like the check-in limit, they turn over at midnight UTC.
// ---------------------------------------------------------------------------------------------

const DAY = 24 * 60 * MINUTE;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The UTC Monday that starts the current week, as Postgres date_trunc('week') counts it. */
function startOfUtcWeek(now: Date): Date {
  const day = startOfUtcDay(now);
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
}

/** The `period_start` the server files progress under: today (daily), this week's Monday (weekly), or 1970-01-01. */
export function questPeriodStart(type: QuestType, now: Date): string {
  if (type === 'daily') return isoDate(startOfUtcDay(now));
  if (type === 'weekly') return isoDate(startOfUtcWeek(now));
  return '1970-01-01';
}

/** When the current period's progress stops counting. Null for one-time quests. */
export function questPeriodEnds(type: QuestType, now: Date): Date | null {
  if (type === 'daily') return nextUtcMidnight(now);
  if (type === 'weekly') return new Date(startOfUtcWeek(now).getTime() + 7 * DAY);
  return null;
}
