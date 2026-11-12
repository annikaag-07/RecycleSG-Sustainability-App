import type { LevelProgress } from '@/shared/api';

/**
 * The level bar, from get_my_level_progress. The bar fills over one level step. A user keeps a level they've reached
 * when an admin raises the step, so XP can be below the level's start (empty bar), and after the step is lowered it
 * can already be past the next one until the next XP arrives (full bar).
 */
export function levelBar(p: LevelProgress) {
  const into = Math.min(p.xp_step, Math.max(0, p.xp_step - p.remaining_xp));
  const next = p.level + 1;
  return {
    into,
    step: p.xp_step,
    fraction: p.xp_step > 0 ? into / p.xp_step : 0,
    text: p.remaining_xp > 0 ? `${p.xp} XP · ${p.remaining_xp} XP to level ${next}` : `${p.xp} XP · level ${next} with your next XP`,
  };
}
