import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/shared/theme';
import { AppText } from './AppText';

type Tone = 'info' | 'warning' | 'error';

type Props = {
  tone?: Tone;
  title?: string;
  children: ReactNode;
};

const toneStyle = {
  info: { icon: 'info', iconColor: colors.textMuted, bg: 'transparent', border: colors.border },
  warning: { icon: 'alert-triangle', iconColor: colors.warning, bg: 'transparent', border: colors.warning },
  error: { icon: 'x-circle', iconColor: colors.danger, bg: colors.dangerSurface, border: colors.dangerBorder },
} as const;

/** Info / offline / "Not the blue bin" style notices from the mockups. */
export function Banner({ tone = 'info', title, children }: Props) {
  const t = toneStyle[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      <Feather name={t.icon} size={18} color={t.iconColor} style={styles.icon} />
      <View style={styles.body}>
        {title && (
          <AppText variant="bodyStrong" style={tone === 'error' ? { color: colors.danger } : undefined}>
            {title}
          </AppText>
        )}
        {typeof children === 'string' ? <AppText variant="small">{children}</AppText> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  icon: { marginTop: 2 },
  body: { flex: 1, gap: spacing.xs },
});
