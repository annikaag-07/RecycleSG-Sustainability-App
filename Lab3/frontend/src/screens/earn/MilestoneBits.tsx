// Milestone pieces shared by EnvironmentalImpactUI and MilestoneContributionUI.
import { StyleSheet, View } from 'react-native';

import type { Milestone, MilestoneStatus } from '@/shared/api/proposed';
import { AppText } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';

// Same wording and colours as MilestoneVerificationUI, so users and admins see one vocabulary.
// NFR-QUAL-12: the states are told apart by text, not colour alone.
const STATUS: Record<MilestoneStatus, { label: string; color: string }> = {
  Active: { label: 'Collecting', color: colors.textMuted },
  AwaitingVerification: { label: 'Awaiting verification', color: colors.warning },
  Verified: { label: 'Verified outcome', color: colors.success },
  VerificationRejected: { label: 'Verification rejected', color: colors.danger },
};

export function milestoneStatusLabel(status: MilestoneStatus) {
  return STATUS[status].label;
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.badge, { borderColor: s.color }]}>
      <AppText variant="caption" style={{ color: s.color }}>
        {s.label}
      </AppText>
    </View>
  );
}

export function MilestoneProgress({ milestone: m }: { milestone: Milestone }) {
  const progress = m.target_points > 0 ? Math.min(1, m.current_points / m.target_points) : 0;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel="Community progress"
      accessibilityValue={{ min: 0, max: m.target_points, now: m.current_points }}
    >
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
    </View>
  );
}

export function formatClosingDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Open for contributions: Active and not past its closing date (UC 3.3 precondition 4). */
export function isOpen(m: Milestone, now = new Date()) {
  return m.status === 'Active' && (!m.closing_date || new Date(m.closing_date) >= now) && m.current_points < m.target_points;
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.success },
});
