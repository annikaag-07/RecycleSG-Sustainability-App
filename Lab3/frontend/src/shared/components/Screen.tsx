import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/shared/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  /** Tab screens already sit above the tab bar, so they skip the bottom inset. */
  edges?: Edge[];
  padded?: boolean;
  style?: ViewStyle;
};

export function Screen({ children, scroll = false, edges = ['top'], padded = true, style }: Props) {
  const content = padded ? styles.padded : undefined;
  return (
    <SafeAreaView edges={edges} style={styles.root}>
      {scroll ? (
        <ScrollView contentContainerStyle={[content, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, content, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.lg },
});
