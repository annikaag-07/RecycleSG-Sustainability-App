import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { api } from '@/shared/api';
import type { PendingPointReport, ReportResolution } from '@/shared/api/admin';
import { adminErrorMessage } from '@/shared/api/admin';
import { AppText, Banner, Button, Card, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { AdminGate } from './AdminGate';
import { cleanText, NoticeBanner, type Notice } from './adminBits';
import { pointTitle } from './pointDisplay';

const PAGE = 20;
const CATEGORY_LABELS: Record<PendingPointReport['category'], string> = {
  full: 'Bin is full',
  missing_or_damaged: 'Bin is missing or damaged',
  wrong_info: 'Wrong information shown',
  contaminated: 'Contaminated / misused',
};

/** REQ-12.2 — review and resolve users' recycling-point reports (UC 2.3). Administrators only. */
export default function ReportReviewUI() {
  return (
    <AdminGate title="Point reports" need="admin">
      <Reports />
    </AdminGate>
  );
}

function Reports() {
  const [reports, setReports] = useState<PendingPointReport[]>([]);
  const [labels, setLabels] = useState<Map<number, { name: string; address: string }>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async (beforeId: number | null) => {
    setLoading(true);
    try {
      const rows = await api.admin.listPointReports(beforeId, PAGE);
      const names = await api.admin.pointLabels([...new Set(rows.map((r) => r.recycling_point_id))]);
      setReports((prev) => (beforeId == null ? rows : [...prev, ...rows]));
      setLabels((prev) => new Map([...prev, ...names]));
      setHasMore(rows.length === PAGE);
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const closed = (id: number, msg: Notice) => {
    setReports((list) => list.filter((r) => r.id !== id));
    setNotice(msg);
  };

  return (
    <Screen scroll>
      <Header title="Point reports" leading="back" />
      <AppText color="textMuted">
        Pending reports from users, newest first. Resolving a report doesn't change the point — edit the point separately if
        its details are wrong.
      </AppText>
      <NoticeBanner notice={notice} />
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} label={labels.get(r.recycling_point_id)} onClosed={(msg) => closed(r.id, msg)} />
      ))}
      {loading && <ActivityIndicator color={colors.text} />}
      {!loading && reports.length === 0 && <AppText color="textMuted">No pending reports.</AppText>}
      {!loading && hasMore && <Button label="Load more" variant="secondary" onPress={() => load(reports[reports.length - 1]!.id)} />}
      {!loading && <Button label="Refresh" variant="ghost" onPress={() => load(null)} />}
    </Screen>
  );
}

function ReportCard({
  report: r,
  label,
  onClosed,
}: {
  report: PendingPointReport;
  label?: { name: string; address: string };
  onClosed: (msg: Notice) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<ReportResolution>();
  const [error, setError] = useState<string>();
  const place = label ? pointTitle(label.name, label.address).title : `Point #${r.recycling_point_id} (inactive or removed)`;

  const decide = async (resolution: ReportResolution) => {
    setBusy(resolution);
    setError(undefined);
    try {
      await api.admin.reviewPointReport(r.id, resolution, cleanText(note, 500));
      onClosed({ tone: 'info', text: `Report #${r.id} ${resolution === 'Resolved' ? 'resolved' : 'dismissed'}.` });
    } catch (e) {
      const msg = adminErrorMessage(e);
      // P0002: another admin closed it first — drop it from the list.
      if ((e as { code?: string }).code === 'P0002') onClosed({ tone: 'error', text: `Report #${r.id}: ${msg}` });
      else setError(msg);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.pill}>
          <AppText variant="caption" color="warning">
            {CATEGORY_LABELS[r.category]}
          </AppText>
        </View>
        <AppText variant="small" color="textFaint">
          #{r.id} · {new Date(r.created_at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{place}</AppText>
      {/* User-submitted text, shown as plain text (NFR-SAFE-04, NFR-SEC-06). */}
      {r.description ? <AppText color="textMuted">“{r.description}”</AppText> : <AppText color="textFaint">No description.</AppText>}
      <TextField label="Note for the record (optional)" value={note} onChangeText={setNote} maxLength={500} />
      {error && <Banner tone="error">{error}</Banner>}
      <View style={styles.actions}>
        <Button label="Resolve" style={styles.fill} onPress={() => decide('Resolved')} loading={busy === 'Resolved'} disabled={!!busy} />
        <Button label="Dismiss" variant="secondary" style={styles.fill} onPress={() => decide('Dismissed')} loading={busy === 'Dismissed'} disabled={!!busy} />
      </View>
      <Button
        label="Edit this point"
        variant="ghost"
        onPress={() => router.push({ pathname: '/admin/points', params: { point: String(r.recycling_point_id) } })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pill: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  actions: { flexDirection: 'row', gap: spacing.md },
});
