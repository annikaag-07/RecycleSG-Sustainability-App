// Opening-hours helpers. recycling_points.operating_hours is free text and currently empty for every NEA point,
// so every function here returns "unknown" rather than guessing (NFR-BR-06: hours are point-specific).

export type OpenState = { kind: 'open'; closesAt?: string } | { kind: 'closed'; opensAt?: string } | { kind: 'unknown' };

const ALWAYS_OPEN = /^(24\s*(hours|hrs|\/7)|always open|open 24 hours)$/i;
// "08:00-22:00", "Mon-Sun 08:00-22:00", "8:00 - 22:00"
const DAILY_RANGE = /^(?:mon\s*[-–]\s*sun\s*)?(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/i;

/** Singapore local time, independent of the device's time zone. */
function sgtMinutesNow(now: Date): number {
  const sgt = new Date(now.getTime() + (now.getTimezoneOffset() + 8 * 60) * 60000);
  return sgt.getHours() * 60 + sgt.getMinutes();
}

export function openState(hours: string | null | undefined, now = new Date()): OpenState {
  const text = hours?.trim();
  if (!text) return { kind: 'unknown' };
  if (ALWAYS_OPEN.test(text)) return { kind: 'open' };

  const m = DAILY_RANGE.exec(text);
  if (!m) return { kind: 'unknown' };
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const t = sgtMinutesNow(now);
  const fmt = (h: string, min: string) => `${h.padStart(2, '0')}:${min}`;
  const isOpen = start <= end ? t >= start && t < end : t >= start || t < end; // handles overnight ranges
  return isOpen ? { kind: 'open', closesAt: fmt(m[3], m[4]) } : { kind: 'closed', opensAt: fmt(m[1], m[2]) };
}

/** Short label for cards: "Always open", "Open · closes 22:00", "Closed · opens 08:00", "Hours not listed". */
export function openLabel(state: OpenState): string {
  switch (state.kind) {
    case 'open':
      return state.closesAt ? `Open · closes ${state.closesAt}` : 'Always open';
    case 'closed':
      return state.opensAt ? `Closed · opens ${state.opensAt}` : 'Closed';
    default:
      return 'Hours not listed';
  }
}
