// How badge progress is worded and ordered. The server decides what counts (badge_progress in the progress_rules
// migration); these only describe it.
import type { BadgeProgress } from '@/shared/api/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 of 5 verified drops", "Best run: 3 of 7 days in a row", "1 of 2 regions". */
export function progressText(b: BadgeProgress): string {
  const done = Math.min(b.progress, b.target);
  switch (b.criterion) {
    case 'streak':
      return `Best run: ${done} of ${plural(b.target, 'day')} in a row`;
    case 'regions':
      return `${done} of ${plural(b.target, 'region')}`;
    default:
      return `${done} of ${plural(b.target, 'verified drop')}`;
  }
}

/** What's left to do. A badge already reached is awarded when the next drop is verified. */
export function nextStep(b: BadgeProgress): string {
  const left = b.target - b.progress;
  if (left <= 0) return 'Unlocks with your next verified drop.';
  switch (b.criterion) {
    case 'streak':
      // Progress is the longest run so far; a new run has to reach the target on its own.
      return `Recycle on ${plural(b.target, 'day')} in a row.${b.progress > 0 ? ` Your best so far is ${plural(b.progress, 'day')}.` : ''}`;
    case 'regions':
      return `Recycle at a point in ${plural(left, 'more region')}.`;
    default:
      return `${plural(left, 'more verified drop')} to go.`;
  }
}

/** Shown when the badge has no description of its own. */
export function defaultDescription(b: BadgeProgress): string {
  switch (b.criterion) {
    case 'streak':
      return `Recycle on ${plural(b.target, 'day')} in a row`;
    case 'regions':
      return `Recycle in ${plural(b.target, 'region')} of Singapore`;
    default:
      return `Complete ${plural(b.target, 'verified drop')}`;
  }
}

/**
 * The locked badge closest to unlocking (UC 4.1 step 8): furthest along as a share of its target, then fewest steps
 * left. Badges count different things, so a share is the only fair comparison.
 */
export function closestBadge(badges: BadgeProgress[]): BadgeProgress | undefined {
  const share = (b: BadgeProgress) => Math.min(b.progress, b.target) / Math.max(1, b.target);
  return badges
    .filter((b) => !b.earned_at)
    .sort((a, b) => share(b) - share(a) || a.target - a.progress - (b.target - b.progress) || a.id - b.id)[0];
}
