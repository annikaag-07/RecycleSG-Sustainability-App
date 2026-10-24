// Initials avatar and display name, shared by LeaderboardUI and FeedUI. There are no profile photos on the server yet.
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components';
import { colors } from '@/shared/theme';

/** The name people chose to show, falling back to their username. */
export function personName(p: { display_name: string | null; username: string }) {
  return p.display_name?.trim() || p.username;
}

export function initials(name: string) {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function Avatar({ name, highlight }: { name: string; highlight?: boolean }) {
  return (
    <View style={[styles.avatar, highlight && styles.highlight]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AppText variant="small" style={styles.bold}>
        {initials(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: { backgroundColor: colors.borderStrong },
  bold: { fontWeight: '700' },
});
