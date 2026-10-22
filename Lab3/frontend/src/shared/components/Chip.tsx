import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/shared/theme';
import { AppText } from './AppText';

type Tone = 'default' | 'notAccepted';

type Props = {
  label: string;
  selected?: boolean;
  /** Omit for display-only chips (e.g. accepted materials). */
  onPress?: () => void;
  tone?: Tone;
};

export function Chip({ label, selected = false, onPress, tone = 'default' }: Props) {
  const bg = tone === 'notAccepted' ? colors.notAcceptedChip : selected ? colors.chipSelected : colors.chip;
  const fg = tone === 'notAccepted' ? colors.notAcceptedText : selected ? colors.text : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected } : undefined}
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: bg, borderColor: selected ? colors.borderStrong : 'transparent' }]}
    >
      <AppText variant="small" style={{ color: fg, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
