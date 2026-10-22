import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { colors, spacing } from '@/shared/theme';
import { AppText } from './AppText';

type Props = {
  title?: string;
  /** 'back' shows a chevron, 'close' an X (used for modal-style screens like Report an issue). */
  leading?: 'back' | 'close' | 'none';
  onLeadingPress?: () => void;
  trailing?: ReactNode;
};

export function Header({ title, leading = 'none', onLeadingPress, trailing }: Props) {
  const handleLeading = onLeadingPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.row}>
      {leading !== 'none' && (
        <Pressable
          onPress={handleLeading}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={leading === 'back' ? 'Go back' : 'Close'}
        >
          <Feather name={leading === 'back' ? 'chevron-left' : 'x'} size={26} color={colors.text} />
        </Pressable>
      )}
      {title ? (
        <AppText variant="title" style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </AppText>
      ) : (
        <View style={styles.title} />
      )}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  title: { flex: 1 },
});
