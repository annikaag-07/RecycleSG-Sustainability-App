import { StyleSheet, View } from 'react-native';

import { colors } from '@/shared/theme';

/** A progress track for quests and badges. Always paired with a "3 of 10" text, so progress isn't told by colour alone. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
    >
      <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.success },
});
