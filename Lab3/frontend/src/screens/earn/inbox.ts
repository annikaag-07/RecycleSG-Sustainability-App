// What each inbox entry says and where tapping it goes. The server stores IDs only (PROGRESS_API.md), so names are
// looked up by the screen and passed in.
import type { AppNotification } from '@/shared/api/types';

export type InboxNames = {
  people: Map<string, string>;
  badges: Map<number, string>;
  quests: Map<number, string>;
  milestones: Map<number, string>;
};

export type InboxTarget =
  | { to: 'post'; id: number }
  | { to: 'user'; id: string }
  | { to: 'milestone'; id: number }
  | { to: 'you' | 'collection' | 'quests' | 'find' };

export type InboxIcon = 'heart' | 'message-circle' | 'user-plus' | 'trending-up' | 'award' | 'zap' | 'flag' | 'clock' | 'bell';

export function describe(n: AppNotification, names: InboxNames): { text: string; icon: InboxIcon; target: InboxTarget | null } {
  const p = n.payload;
  const who = (p.actor_id && names.people.get(p.actor_id)) || 'Someone';
  switch (n.kind) {
    case 'like':
      return { text: `${who} liked your post`, icon: 'heart', target: p.post_id ? { to: 'post', id: p.post_id } : null };
    case 'comment':
      return { text: `${who} commented on your post`, icon: 'message-circle', target: p.post_id ? { to: 'post', id: p.post_id } : null };
    case 'follow':
      return { text: `${who} now follows you`, icon: 'user-plus', target: p.actor_id ? { to: 'user', id: p.actor_id } : null };
    case 'level_up':
      return { text: p.level ? `You reached level ${p.level}` : 'You reached a new level', icon: 'trending-up', target: { to: 'you' } };
    case 'badge_earned': {
      const badge = p.badge_id != null ? names.badges.get(p.badge_id) : undefined;
      return { text: badge ? `You earned the ${badge} badge` : 'You earned a new badge', icon: 'award', target: { to: 'collection' } };
    }
    case 'quest_completed': {
      const quest = p.quest_id != null ? names.quests.get(p.quest_id) : undefined;
      return { text: `You completed ${quest ? `“${quest}”` : 'a quest'}. Claim your reward.`, icon: 'zap', target: { to: 'quests' } };
    }
    case 'milestone_verified': {
      const milestone = p.milestone_id != null ? names.milestones.get(p.milestone_id) : undefined;
      return {
        text: `${milestone ?? 'A milestone you contributed to'} was verified. Thanks for helping.`,
        icon: 'flag',
        target: p.milestone_id != null ? { to: 'milestone', id: p.milestone_id } : { to: 'you' },
      };
    }
    case 'streak_at_risk':
      return { text: 'Your streak is at risk. Recycle today to keep it going.', icon: 'clock', target: { to: 'find' } };
    default:
      return { text: 'Something new happened', icon: 'bell', target: null };
  }
}

/** Distinct people named in these notifications, for one lookup each. */
export function actorIds(list: AppNotification[]): string[] {
  return [...new Set(list.flatMap((n) => (n.payload.actor_id ? [n.payload.actor_id] : [])))];
}
