import { useEffect, useState } from 'react';

/** "19:27" — 24-hour, like the rest of the app. */
export function clockTime(d: Date): string {
  return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "just now", "12 min ago", "6 h ago", "3 days ago". */
export function timeAgo(d: Date, now = new Date()): string {
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Current time, refreshed every `intervalMs`, for countdowns such as the 15-minute log window. */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
