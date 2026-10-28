import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/shared/theme';
import { AppText } from './AppText';

type Props = {
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  message?: string;
  children?: ReactNode;
};

/** Centred icon + title + message, e.g. "Location is switched off", "You are not following anyone yet". */
export function EmptyState({ icon, title, message, children }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconTile}>
        <Feather name={icon} size={28} color={colors.textMuted} />
      </View>
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      {message && (
        <AppText variant="small" color="textMuted" style={styles.center}>
          {message}
        </AppText>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
