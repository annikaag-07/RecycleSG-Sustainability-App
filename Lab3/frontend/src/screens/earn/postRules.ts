// Post rules the server enforces (social_community migration), checked on the device first so the composer can say
// what's wrong before anything uploads.
import type { CheckIn, RecyclingAction, RewardTransaction } from '@/shared/api/types';

/** Letters, digits and underscores, up to 50 (social.tags). Stricter than the server, which also takes non-English letters. */
const TAG = /^[A-Za-z0-9_]{1,50}$/;
export const MAX_TAGS = 20;

/**
 * "#Plastic, #angmokio zerowaste" -> tags ["plastic", "angmokio", "zerowaste"]. Lowercase without the "#", duplicates
 * dropped, like the server stores them. Anything that isn't a valid tag comes back in `invalid`.
 */
export function parseTags(text: string): { tags: string[]; invalid: string[] } {
  const tags: string[] = [];
  const invalid: string[] = [];
  for (const word of text.split(/[\s,]+/)) {
    const tag = word.replace(/^#+/, '');
    if (!word) continue;
    if (!TAG.test(tag)) invalid.push(word);
    else if (!tags.includes(tag.toLowerCase())) tags.push(tag.toLowerCase());
  }
  return { tags, invalid };
}

/** What's stopping the composer from posting, or null when it's ready. */
export function postProblem(p: { photoCount: number; caption: string; tagText: string }, maxCaption: number): string | null {
  if (p.photoCount === 0) return 'Add at least one photo.';
  if (p.caption.length > maxCaption) return `Shorten the caption to ${maxCaption.toLocaleString('en-SG')} characters.`;
  const { tags, invalid } = parseTags(p.tagText);
  if (invalid.length) return `Hashtags can only use letters, numbers and underscores: ${invalid.join(' ')}`;
  if (tags.length > MAX_TAGS) return `Use up to ${MAX_TAGS} hashtags.`;
  return null;
}

/** "1 like", "24 likes". */
export function countLabel(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString('en-SG')} ${n === 1 ? one : many}`;
}

export type LinkableCheckIn =
  | { kind: 'verified'; checkIn: CheckIn; items: number; points: number }
  /** create_post only takes a check-in with verified recycling, so this one can't be linked yet. */
  | { kind: 'pending'; checkIn: CheckIn };

/**
 * The check-in a post can link to (UC 5.1 step 3): the one asked for, or else the latest with verified recycling.
 * Items and points count verified recycling only, which is what the server snapshots onto the post.
 */
export function linkableCheckIn(
  checkIns: CheckIn[],
  actions: RecyclingAction[],
  rewards: RewardTransaction[],
  wantedId?: number,
): LinkableCheckIn | null {
  const verified = actions.filter((a) => a.verification_status === 'Verified');
  const summary = (checkIn: CheckIn): LinkableCheckIn | null => {
    const mine = verified.filter((a) => a.check_in_id === checkIn.id);
    if (mine.length === 0) return null;
    const ids = new Set(mine.map((a) => a.id));
    return {
      kind: 'verified',
      checkIn,
      items: mine.reduce((n, a) => n + a.quantity, 0),
      points: rewards.reduce((n, r) => n + (r.recycling_action_id != null && ids.has(r.recycling_action_id) ? r.eco_points_earned : 0), 0),
    };
  };
  if (wantedId != null) {
    const wanted = checkIns.find((c) => c.id === wantedId);
    return wanted ? (summary(wanted) ?? { kind: 'pending', checkIn: wanted }) : null;
  }
  for (const c of checkIns) {
    const s = summary(c);
    if (s) return s;
  }
  return null;
}
