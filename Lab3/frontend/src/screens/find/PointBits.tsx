// Small visual pieces shared by the Find screens.
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppText } from '@/shared/components';
import { formatDistance, walkingMinutes } from '@/shared/geo';
import { MARKER_COLORS } from '@/shared/map/types';
import { materialMeta, type Stream } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import type { PointView } from './pointDisplay';

export function PointTypeTile({ stream, size = 40 }: { stream: Stream; size?: number }) {
  const icon = stream === 'eWaste' ? 'flash' : 'trash-can-outline';
  return (
    <View style={[styles.typeTile, { width: size, height: size, backgroundColor: MARKER_COLORS[stream] }]}>
      <MaterialCommunityIcons name={icon} size={size / 2} color={stream === 'eWaste' ? colors.onEWaste : colors.text} />
    </View>
  );
}

export function MaterialTile({ name }: { name: string }) {
  const meta = materialMeta(name);
  return (
    <View style={[styles.materialTile, { backgroundColor: meta.color }]} accessibilityLabel={name} accessible>
      <MaterialCommunityIcons name={meta.icon} size={16} color={colors.text} />
    </View>
  );
}

/** Right-hand distance column: "225m / 3 MIN" or "0m / HERE". Hidden when there is no origin. */
export function DistanceLabel({ meters, here }: { meters: number | null; here?: boolean }) {
  if (meters == null) return null;
  return (
    <View style={styles.distance}>
      <AppText variant="bodyStrong">{formatDistance(meters)}</AppText>
      <AppText variant="caption" color="textMuted">
        {here ? 'HERE' : `~${walkingMinutes(meters)} MIN`}
      </AppText>
    </View>
  );
}

/** One row in a results list (mockup "Take it to" / "Nearest points"). */
export function PointRow({ point, showDistance, onPress }: { point: PointView; showDistance: boolean; onPress: () => void }) {
  const materials = point.materials.length ? point.materials.join(' · ') : 'Accepted materials not listed';
  const hours = point.open.kind === 'open' ? ` · ${point.open.always ? 'always open' : 'open now'}` : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${point.title}. ${materials}.${showDistance ? ` ${formatDistance(point.distanceM)} away.` : ''}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <PointTypeTile stream={point.stream} />
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {point.title}
        </AppText>
        <AppText variant="small" color="textMuted" numberOfLines={1}>
          {materials}
          {hours}
        </AppText>
      </View>
      <DistanceLabel meters={showDistance ? point.distanceM : null} here={showDistance && point.distanceM < 15} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  typeTile: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  materialTile: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  distance: { alignItems: 'flex-end' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
