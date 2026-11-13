import { Image } from 'react-native';

import type { BadgeProgress } from '@/shared/api';

// The badge medallions from the UI mockups, pre-drawn (assets/badges). The ring colour is how hard the badge is:
// teal, yellow, gold, coral, rose. Metro needs every require spelled out, hence the table.
const MEDALS = {
  'first-1': [require('../../../assets/badges/first-1.png'), require('../../../assets/badges/first-1-locked.png')],
  'plastic-2': [require('../../../assets/badges/plastic-2.png'), require('../../../assets/badges/plastic-2-locked.png')],
  'loop-4': [require('../../../assets/badges/loop-4.png'), require('../../../assets/badges/loop-4-locked.png')],
  'century-5': [require('../../../assets/badges/century-5.png'), require('../../../assets/badges/century-5-locked.png')],
  'streak-2': [require('../../../assets/badges/streak-2.png'), require('../../../assets/badges/streak-2-locked.png')],
  'streak50-3': [require('../../../assets/badges/streak50-3.png'), require('../../../assets/badges/streak50-3-locked.png')],
  'streak50-4': [require('../../../assets/badges/streak50-4.png'), require('../../../assets/badges/streak50-4-locked.png')],
  'island-2': [require('../../../assets/badges/island-2.png'), require('../../../assets/badges/island-2-locked.png')],
  'explore-3': [require('../../../assets/badges/explore-3.png'), require('../../../assets/badges/explore-3-locked.png')],
} as const;

/**
 * Picked from what the badge counts and how much, not its name, so a badge an admin adds in Game rules still gets
 * a fitting one: an item into the bin, a bottle, the loop, a stack; a flame or a calendar; town blocks or a pin.
 */
function medalKey(b: BadgeProgress): keyof typeof MEDALS {
  switch (b.criterion) {
    case 'streak':
      return b.target <= 3 ? 'streak-2' : b.target <= 7 ? 'streak50-3' : 'streak50-4';
    case 'regions':
      return b.target <= 2 ? 'island-2' : 'explore-3';
    default:
      return b.target <= 1 ? 'first-1' : b.target <= 10 ? 'plastic-2' : b.target <= 50 ? 'loop-4' : 'century-5';
  }
}

/** In colour once earned; greyed while locked. */
export function Medal({ badge, earned, size = 44 }: { badge: BadgeProgress; earned: boolean; size?: number }) {
  return (
    <Image
      source={MEDALS[medalKey(badge)][earned ? 0 : 1]}
      style={{ width: size, height: size }}
      accessibilityLabel={earned ? 'Earned' : 'Not earned yet'}
    />
  );
}
