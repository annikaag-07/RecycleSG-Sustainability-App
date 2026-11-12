import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, type MaterialType, type PointStatus } from '@/shared/api';
import type { AdminPoint, PointInput } from '@/shared/api/admin';
import { adminErrorMessage } from '@/shared/api/admin';
import { AppText, Banner, Button, Card, Chip, Header, Screen, TextField } from '@/shared/components';
import { clockToMinutes, dayName, formatWeeklyHours, minutesToClock, type WeeklyInterval } from '@/shared/hours';
import { colors, radius, spacing } from '@/shared/theme';
import { AdminGate } from './AdminGate';
import { ChoiceChips, cleanText, NoticeBanner, NumberField, parseNumberIn, type Notice } from './adminBits';
import { titleCase } from './pointDisplay';

const PAGE = 20;
const STATUSES: PointStatus[] = ['Available', 'Full', 'Temporarily Closed', 'Inaccessible', 'Information Outdated'];
type ActiveFilter = 'active' | 'inactive' | 'all';

/** REQ-12.1 — add, edit, deactivate and remove recycling points. Administrators only. */
export default function PointManagementUI() {
  return (
    <AdminGate title="Recycling points" need="admin">
      <Points />
    </AdminGate>
  );
}

function Points() {
  const params = useLocalSearchParams<{ point?: string }>();
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const [points, setPoints] = useState<AdminPoint[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [editing, setEditing] = useState<AdminPoint | 'new' | null>(null);

  const load = useCallback(
    async (afterId: number | null) => {
      setLoading(true);
      try {
        const active = filter === 'all' ? null : filter === 'active';
        const rows = await api.admin.listPoints(afterId, PAGE, active);
        setPoints((prev) => (afterId == null ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE);
      } catch (e) {
        setNotice({ tone: 'error', text: adminErrorMessage(e) });
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  useEffect(() => {
    api.points.listMaterialTypes().then(setMaterials).catch(() => undefined);
  }, []);

  // Opened from a report ("Edit this point"): find that point by ID and open its editor.
  useEffect(() => {
    const id = Number(params.point);
    if (!Number.isInteger(id) || id <= 0) return;
    api.admin
      .listPoints(id - 1, 1, null)
      .then((rows) => {
        if (rows[0]?.id === id) setEditing(rows[0]);
        else setNotice({ tone: 'error', text: `Point #${id} wasn't found.` });
      })
      .catch((e) => setNotice({ tone: 'error', text: adminErrorMessage(e) }));
  }, [params.point]);

  if (editing) {
    return (
      <PointEditor
        point={editing === 'new' ? null : editing}
        materials={materials}
        onDone={(msg) => {
          setEditing(null);
          if (msg) {
            setNotice({ tone: 'info', text: msg });
            load(null);
          }
        }}
      />
    );
  }

  return (
    <Screen scroll>
      <Header title="Recycling points" leading="back" />
      <NoticeBanner notice={notice} />
      <Button label="Add a point" icon="plus" onPress={() => setEditing('new')} />
      <ChoiceChips<ActiveFilter>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'all', label: 'All' },
        ]}
      />
      {points.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => setEditing(p)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${p.name}, ${p.address}`}
          style={styles.row}
        >
          <View style={styles.fill}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              #{p.id} {p.name}
            </AppText>
            <AppText variant="small" color="textMuted" numberOfLines={1}>
              {titleCase(p.address)}
            </AppText>
            <AppText variant="small" color="textFaint">
              {p.status} · {p.material_ids.length} material{p.material_ids.length === 1 ? '' : 's'}
              {p.weekly_hours ? ' · hours set' : ''}
            </AppText>
          </View>
          <View style={[styles.pill, { borderColor: p.is_active ? colors.success : colors.textFaint }]}>
            <AppText variant="caption" style={{ color: p.is_active ? colors.success : colors.textFaint }}>
              {p.is_active ? 'Active' : 'Inactive'}
            </AppText>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
      {loading && <ActivityIndicator color={colors.text} />}
      {!loading && points.length === 0 && <AppText color="textMuted">No points match this filter.</AppText>}
      {!loading && hasMore && <Button label="Load more" variant="secondary" onPress={() => load(points[points.length - 1]!.id)} />}
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------------

type IntervalDraft = { day: number; start: string; end: string; week: string };

function toDrafts(weekly: WeeklyInterval[] | null): IntervalDraft[] {
  return (weekly ?? []).map((s) => ({
    day: s.day,
    start: minutesToClock(s.start),
    end: minutesToClock(s.end),
    week: s.week ? String(s.week) : '',
  }));
}

function PointEditor({
  point,
  materials,
  onDone,
}: {
  point: AdminPoint | null;
  materials: MaterialType[];
  onDone: (message?: string) => void;
}) {
  const [name, setName] = useState(point?.name ?? '');
  const [address, setAddress] = useState(point?.address ?? '');
  const [lat, setLat] = useState(point ? String(point.latitude) : '');
  const [lng, setLng] = useState(point ? String(point.longitude) : '');
  const [region, setRegion] = useState(point?.region ?? '');
  const [source, setSource] = useState(point?.source ?? '');
  const [status, setStatus] = useState<PointStatus>(point?.status === 'Removed' ? 'Available' : point?.status ?? 'Available');
  const [materialIds, setMaterialIds] = useState<number[]>(point?.material_ids ?? []);
  const [hoursKnown, setHoursKnown] = useState(point ? point.weekly_hours !== null : false);
  const [intervals, setIntervals] = useState<IntervalDraft[]>(toDrafts(point?.weekly_hours ?? null));
  const [hoursText, setHoursText] = useState(point?.operating_hours ?? '');
  const [active, setActive] = useState(point?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<'save' | 'remove'>();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const toggleMaterial = (id: number) =>
    setMaterialIds((ids) => (ids.includes(id) ? ids.filter((m) => m !== id) : [...ids, id].sort((a, b) => a - b)));

  const updateInterval = (i: number, patch: Partial<IntervalDraft>) =>
    setIntervals((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  /** Builds the full record, or records field errors and returns null. */
  const build = (): PointInput | null => {
    const e: Record<string, string> = {};
    const latitude = parseNumberIn(lat, -90, 90);
    const longitude = parseNumberIn(lng, -180, 180);
    if (!cleanText(name, 200)) e.name = 'Name is required';
    if (!cleanText(address, 300)) e.address = 'Address is required';
    if (latitude == null) e.lat = 'A number between -90 and 90';
    if (longitude == null) e.lng = 'A number between -180 and 180';
    let weekly: WeeklyInterval[] | null = null;
    if (hoursKnown) {
      weekly = [];
      intervals.forEach((d, i) => {
        const start = clockToMinutes(d.start);
        const end = clockToMinutes(d.end);
        const week = d.week.trim() ? Number(d.week) : null;
        if (start == null || start > 1439 || end == null || start === end || (week != null && !(week >= 1 && week <= 5))) {
          e[`interval${i}`] = 'Use HH:MM times (start 00:00–23:59, end up to 24:00, not equal) and week 1–5 or blank';
        } else {
          weekly!.push({ day: d.day, start, end, ...(week ? { week } : {}) });
        }
      });
    }
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      name: cleanText(name, 200)!,
      address: cleanText(address, 300)!,
      latitude: latitude!,
      longitude: longitude!,
      status,
      region: cleanText(region, 80),
      source: cleanText(source, 120),
      is_active: active,
      weekly_hours: weekly,
      operating_hours: cleanText(hoursText, 200),
      material_ids: materialIds,
    };
  };

  const save = async () => {
    const input = build();
    if (!input) {
      setNotice({ tone: 'error', text: 'Fix the highlighted fields.' });
      return;
    }
    setBusy('save');
    setNotice(null);
    try {
      const id = await api.admin.savePoint(point?.id ?? null, input);
      onDone(point ? `Saved #${id} ${input.name}.` : `Added #${id} ${input.name}.`);
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    if (!point) return;
    setBusy('remove');
    setNotice(null);
    try {
      const result = await api.admin.removePoint(point.id);
      onDone(
        result === 'deleted'
          ? `Deleted #${point.id} ${point.name}.`
          : `Archived #${point.id} ${point.name}: it has history, so it was hidden from search and check-in instead of deleted.`,
      );
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
      setBusy(undefined);
    }
  };

  const preview = hoursKnown ? formatWeeklyHours(
    intervals.flatMap((d) => {
      const s = clockToMinutes(d.start);
      const en = clockToMinutes(d.end);
      return s != null && en != null && s !== en ? [{ day: d.day, start: s, end: en, week: d.week ? Number(d.week) : null }] : [];
    }),
  ) : null;

  return (
    <Screen scroll>
      <Header title={point ? `Edit #${point.id}` : 'New point'} leading="close" onLeadingPress={() => onDone()} />
      <NoticeBanner notice={notice} />

      <Card label="Details">
        <TextField label="Name" value={name} onChangeText={setName} error={errors.name} maxLength={200} />
        <TextField label="Address" value={address} onChangeText={setAddress} error={errors.address} maxLength={300} />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <NumberField label="Latitude" value={lat} onChange={setLat} error={errors.lat} decimal />
          </View>
          <View style={styles.fill}>
            <NumberField label="Longitude" value={lng} onChange={setLng} error={errors.lng} decimal />
          </View>
        </View>
        <TextField label="Region (optional)" value={region} onChangeText={setRegion} placeholder="e.g. North-East" maxLength={80} />
        <TextField label="Source (optional)" value={source} onChangeText={setSource} placeholder="e.g. NEA Recycling Bins" maxLength={120} />
        <ChoiceChips<PointStatus> label="Status" value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />
      </Card>

      <Card label="Accepted materials">
        <View style={styles.wrap}>
          {materials.map((m) => (
            <Chip key={m.id} label={m.name} selected={materialIds.includes(m.id)} onPress={() => toggleMaterial(m.id)} />
          ))}
        </View>
        {materialIds.length === 0 && (
          <AppText variant="small" color="textFaint">
            No materials selected — the point won't appear in material searches.
          </AppText>
        )}
      </Card>

      <Card label="Opening hours (Singapore time)">
        <ChoiceChips<'unknown' | 'known'>
          value={hoursKnown ? 'known' : 'unknown'}
          onChange={(v) => setHoursKnown(v === 'known')}
          options={[
            { value: 'unknown', label: 'Hours unknown' },
            { value: 'known', label: 'Weekly schedule' },
          ]}
        />
        {hoursKnown && (
          <>
            {intervals.length === 0 && (
              <AppText variant="small" color="textMuted">
                No intervals = closed all week. Add one per opening period.
              </AppText>
            )}
            {intervals.map((d, i) => (
              <View key={i} style={styles.interval}>
                <View style={styles.wrap}>
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <Chip key={day} label={dayName(day)} selected={d.day === day} onPress={() => updateInterval(i, { day })} />
                  ))}
                </View>
                <View style={styles.pair}>
                  <View style={styles.fill}>
                    <TextField label="Opens" value={d.start} onChangeText={(t) => updateInterval(i, { start: t })} placeholder="08:00" />
                  </View>
                  <View style={styles.fill}>
                    <TextField label="Closes" value={d.end} onChangeText={(t) => updateInterval(i, { end: t })} placeholder="22:00" />
                  </View>
                  <View style={styles.week}>
                    <NumberField label="Week (1–5)" value={d.week} onChange={(t) => updateInterval(i, { week: t.slice(0, 1) })} />
                  </View>
                </View>
                {errors[`interval${i}`] && (
                  <AppText variant="small" color="danger">
                    {errors[`interval${i}`]}
                  </AppText>
                )}
                <Button
                  label="Remove interval"
                  variant="ghost"
                  onPress={() => setIntervals((list) => list.filter((_, j) => j !== i))}
                />
              </View>
            ))}
            <Button
              label="Add interval"
              variant="secondary"
              icon="plus"
              onPress={() => setIntervals((list) => [...list, { day: 1, start: '08:00', end: '22:00', week: '' }])}
            />
            <AppText variant="small" color="textFaint">
              Closes earlier than it opens = runs past midnight. 00:00–24:00 = open all day. Week 2 on a Sunday = only the
              second Sunday of each month.
            </AppText>
            {preview && preview.length > 0 && (
              <Banner tone="info" title="Preview">
                {preview.join('\n')}
              </Banner>
            )}
          </>
        )}
        <TextField
          label="Hours note shown to users (optional)"
          value={hoursText}
          onChangeText={setHoursText}
          placeholder="e.g. Closed on public holidays"
          maxLength={200}
        />
      </Card>

      <Card label="Visibility">
        <View style={styles.switchRow}>
          <View style={styles.fill}>
            <AppText variant="bodyStrong">Active</AppText>
            <AppText variant="small" color="textMuted">
              Inactive points are hidden from search and can't be checked in at.
            </AppText>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            accessibilityLabel="Active"
            trackColor={{ false: colors.borderStrong, true: colors.success }}
            thumbColor={colors.text}
          />
        </View>
      </Card>

      <Button label={point ? 'Save changes' : 'Add point'} onPress={save} loading={busy === 'save'} disabled={!!busy} />

      {point && !confirmRemove && (
        <Button label="Remove point" variant="ghost" onPress={() => setConfirmRemove(true)} disabled={!!busy} />
      )}
      {point && confirmRemove && (
        <View style={styles.dangerBox}>
          <AppText variant="bodyStrong" style={{ color: colors.danger }}>
            Remove #{point.id}?
          </AppText>
          <AppText variant="small" color="textMuted">
            Points with check-in history are archived (hidden, history kept) rather than deleted.
          </AppText>
          <Button label="Remove permanently" variant="danger" onPress={remove} loading={busy === 'remove'} disabled={!!busy} />
          <Button label="Cancel" variant="ghost" onPress={() => setConfirmRemove(false)} disabled={!!busy} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md },
  week: { width: 110 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  interval: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dangerBox: { gap: spacing.sm, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.md, padding: spacing.md },
});
