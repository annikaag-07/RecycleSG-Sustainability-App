import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { api } from '@/shared/api';
import type { UsageStats } from '@/shared/api/admin';
import { adminErrorMessage } from '@/shared/api/admin';
import { AppText, Button, Card, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { AdminGate } from './AdminGate';
import { ChoiceChips, isIsoDate, NoticeBanner, sgDate, sgMonthStart, type Notice } from './adminBits';

type Preset = 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

/** [from, until) as Singapore dates for a preset. `until` is exclusive, so "today" ends at tomorrow. */
function range(p: Exclude<Preset, 'custom'>): { from: string; until: string } {
  switch (p) {
    case 'last7':
      return { from: sgDate(-6), until: sgDate(1) };
    case 'last30':
      return { from: sgDate(-29), until: sgDate(1) };
    case 'thisMonth':
      return { from: sgMonthStart(0), until: sgDate(1) };
    case 'lastMonth':
      return { from: sgMonthStart(-1), until: sgMonthStart(0) };
  }
}

/** REQ-12.4 — usage and impact statistics. Administrators only. */
export default function UsageStatisticsUI() {
  return (
    <AdminGate title="Usage statistics" need="admin">
      <Stats />
    </AdminGate>
  );
}

function Stats() {
  const [preset, setPreset] = useState<Preset>('last7');
  const [from, setFrom] = useState(range('last7').from);
  const [until, setUntil] = useState(range('last7').until);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [shown, setShown] = useState<{ from: string; until: string } | null>(null);

  const run = useCallback(async (f: string, u: string) => {
    if (!isIsoDate(f) || !isIsoDate(u) || u <= f) {
      setNotice({ tone: 'error', text: 'Use YYYY-MM-DD dates, with the end after the start.' });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      setStats(await api.admin.usageStats(f, u));
      setShown({ from: f, until: u });
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the default period once; later changes run on demand (`run` is stable).
  useEffect(() => {
    const r = range('last7');
    run(r.from, r.until);
  }, [run]);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = range(p);
      setFrom(r.from);
      setUntil(r.until);
      run(r.from, r.until);
    }
  };

  const maxQty = Math.max(1, ...(stats?.items_by_material.map((m) => m.quantity) ?? [1]));

  return (
    <Screen scroll>
      <Header title="Usage statistics" leading="back" />
      <ChoiceChips<Preset>
        label="Period"
        value={preset}
        onChange={choose}
        options={[
          { value: 'last7', label: 'Last 7 days' },
          { value: 'last30', label: 'Last 30 days' },
          { value: 'thisMonth', label: 'This month' },
          { value: 'lastMonth', label: 'Last month' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {preset === 'custom' && (
        <Card>
          <View style={styles.pair}>
            <View style={styles.fill}>
              <TextField label="From (inclusive)" value={from} onChangeText={setFrom} placeholder="2026-11-01" />
            </View>
            <View style={styles.fill}>
              <TextField label="Until (exclusive)" value={until} onChangeText={setUntil} placeholder="2026-12-01" />
            </View>
          </View>
          <Button label="Show statistics" onPress={() => run(from.trim(), until.trim())} loading={loading} />
        </Card>
      )}
      <NoticeBanner notice={notice} />
      {loading && <ActivityIndicator color={colors.text} />}

      {stats && shown && !loading && (
        <>
          <AppText variant="small" color="textMuted">
            {shown.from} to {shown.until} (end not included), Singapore dates.
          </AppText>
          <View style={styles.tiles}>
            <Tile label="Active users" value={stats.active_users} hint="checked in at least once" />
            <Tile label="Verified actions" value={stats.verified_actions} hint="by verification time" />
          </View>

          <Card label="Most-used recycling points">
            {stats.most_used_points.length === 0 ? (
              <AppText color="textMuted">No check-ins in this period.</AppText>
            ) : (
              stats.most_used_points.map((p, i) => (
                <View key={p.id} style={styles.listRow}>
                  <AppText color="textMuted" style={styles.rank}>
                    {i + 1}
                  </AppText>
                  <AppText style={styles.fill} numberOfLines={1}>
                    {p.name} <AppText variant="small" color="textFaint">#{p.id}</AppText>
                  </AppText>
                  <AppText variant="bodyStrong">{p.check_ins}</AppText>
                </View>
              ))
            )}
          </Card>

          <Card label="Items recycled by material">
            {stats.items_by_material.length === 0 ? (
              <AppText color="textMuted">No verified recycling in this period.</AppText>
            ) : (
              stats.items_by_material.map((m) => (
                <View key={m.id} style={styles.barRow} accessible accessibilityLabel={`${m.name}: ${m.quantity} items`}>
                  <View style={styles.barLabel}>
                    <AppText>{m.name}</AppText>
                    <AppText variant="bodyStrong">{m.quantity}</AppText>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(m.quantity / maxQty) * 100}%` }]} />
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title">{value.toLocaleString('en-SG')}</AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <AppText variant="caption" color="textFaint">
        {hint}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 20 },
  barRow: { gap: spacing.xs },
  barLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.success },
});
