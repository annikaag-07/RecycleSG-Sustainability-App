import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/shared/theme';
import { AppText } from './AppText';

type Props = {
  children: ReactNode;
  /** Optional uppercase label, e.g. "ACCEPTED HERE". */
  label?: string;
  style?: ViewStyle;
};

export function Card({ children, label, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      {label && (
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
