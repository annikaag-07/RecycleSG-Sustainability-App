// Opening-hours helpers (NFR-BR-06: hours are point-specific, so unknown stays unknown — never guessed).
// The server is the authority: find_recycling_points returns `is_open` and recycling_point_open_now answers for one
// point, both from `weekly_hours` in Singapore time. The free-text parser below is only a fallback for points that
// have a human-readable `operating_hours` string but no schedule.

export type OpenState =
  | { kind: 'open'; closesAt?: string; always?: boolean }
  | { kind: 'closed'; opensAt?: string }
  | { kind: 'unknown' };

/** One weekly interval as stored in `recycling_points.weekly_hours` (FINDER_API.md). */
export type WeeklyInterval = {
  /** ISO weekday, Monday = 1. */
  day: number;
  /** Minutes after midnight, 0–1439. */
  start: number;
  /** Minutes after midnight, 0–1440 (exclusive). Less than `start` means the interval crosses midnight. */
  end: number;
  /** Optional 1–5: only that occurrence of the weekday in the month (e.g. 2 = second Sunday). */
  week?: number | null;
};

const ALWAYS_OPEN = /^(24\s*(hours|hrs|\/7)|always open|open 24 hours)$/i;
// "08:00-22:00", "Mon-Sun 08:00-22:00", "8:00 - 22:00"
const DAILY_RANGE = /^(?:mon\s*[-–]\s*sun\s*)?(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/i;

/** Singapore local time, independent of the device's time zone. */
function sgtMinutesNow(now: Date): number {
  const sgt = new Date(now.getTime() + (now.getTimezoneOffset() + 8 * 60) * 60000);
  return sgt.getHours() * 60 + sgt.getMinutes();
}

/** Fallback: parse a free-text `operating_hours` string. */
export function openState(hours: string | null | undefined, now = new Date()): OpenState {
  const text = hours?.trim();
  if (!text) return { kind: 'unknown' };
  if (ALWAYS_OPEN.test(text)) return { kind: 'open', always: true };

  const m = DAILY_RANGE.exec(text);
  if (!m) return { kind: 'unknown' };
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const t = sgtMinutesNow(now);
  const fmt = (h: string, min: string) => `${h.padStart(2, '0')}:${min}`;
  const isOpen = start <= end ? t >= start && t < end : t >= start || t < end; // handles overnight ranges
  return isOpen ? { kind: 'open', closesAt: fmt(m[3], m[4]) } : { kind: 'closed', opensAt: fmt(m[1], m[2]) };
}

/** The server's answer (`is_open`): true, false, or null for unknown hours. Falls back to the text when null. */
export function openStateFromServer(isOpen: boolean | null | undefined, hoursText?: string | null): OpenState {
  if (isOpen === true) return { kind: 'open' };
  if (isOpen === false) return { kind: 'closed' };
  return openState(hoursText);
}

/** Short label for cards: "Always open", "Open now", "Open · closes 22:00", "Closed now", "Hours not listed". */
export function openLabel(state: OpenState): string {
  switch (state.kind) {
    case 'open':
      return state.always ? 'Always open' : state.closesAt ? `Open · closes ${state.closesAt}` : 'Open now';
    case 'closed':
      return state.opensAt ? `Closed · opens ${state.opensAt}` : 'Closed now';
    default:
      return 'Hours not listed';
  }
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/** 510 -> "08:30"; 1440 -> "24:00". */
export function minutesToClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "08:30" -> 510; "24:00" -> 1440; anything else -> null. */
export function clockToMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export function dayName(day: number): string {
  return DAY_NAMES[day - 1] ?? `Day ${day}`;
}

/**
 * Human-readable schedule lines, e.g. ["Mon 08:00–22:00", "2nd Sun 08:30–11:30"].
 * `null` = hours unknown; `[]` = known to be closed all week (FINDER_API.md).
 */
export function formatWeeklyHours(weekly: WeeklyInterval[] | null | undefined): string[] | null {
  if (weekly == null) return null;
  return [...weekly]
    .sort((a, b) => a.day - b.day || a.start - b.start)
    .map((s) => {
      const when = s.week ? `${ORDINALS[s.week - 1] ?? `Week ${s.week}`} ${dayName(s.day)}` : dayName(s.day);
      const span = s.start === 0 && s.end === 1440 ? 'all day' : `${minutesToClock(s.start)}–${minutesToClock(s.end)}`;
      return `${when} ${span}${s.end < s.start ? ' (next day)' : ''}`;
    });
}
